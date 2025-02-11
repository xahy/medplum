import { getReferenceString, IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { ElementDefinition, PlanDefinition, PlanDefinitionAction, Reference } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { useMedplum } from './MedplumProvider';
import { ReferenceDisplay } from './ReferenceDisplay';
import { setPropertyValue } from './ResourceForm';
import { ResourceInput } from './ResourceInput';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { ResourcePropertyInput } from './ResourcePropertyInput';
import { Select } from './Select';
import { useResource } from './useResource';
import { killEvent } from './utils/dom';

export interface PlanDefinitionBuilderProps {
  value: PlanDefinition | Reference<PlanDefinition>;
  onSubmit: (result: PlanDefinition) => void;
}

export function PlanDefinitionBuilder(props: PlanDefinitionBuilderProps): JSX.Element | null {
  const medplum = useMedplum();
  const defaultValue = useResource(props.value);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [hoverKey, setHoverKey] = useState<string>();
  const [value, setValue] = useState<PlanDefinition>();

  function handleDocumentMouseOver(): void {
    setHoverKey(undefined);
  }

  function handleDocumentClick(): void {
    setSelectedKey(undefined);
  }

  const valueRef = useRef<PlanDefinition>();
  valueRef.current = value;

  useEffect(() => {
    medplum.requestSchema('PlanDefinition').then(setSchema).catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setValue(ensurePlanDefinitionKeys(defaultValue ?? { resourceType: 'PlanDefinition' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  if (!schema || !value) {
    return null;
  }

  function changeProperty(property: string, newValue: any): void {
    setValue({
      ...valueRef.current,
      [property]: newValue,
    } as PlanDefinition);
  }

  return (
    <div className="medplum-questionnaire-builder">
      <Form testid="questionnaire-form" onSubmit={() => props.onSubmit(value)}>
        <FormSection title="Plan Title" htmlFor="title">
          <Input defaultValue={value.title} onChange={(newValue) => changeProperty('title', newValue)} />
        </FormSection>
        <ActionArrayBuilder
          actions={value.action || []}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          hoverKey={hoverKey}
          setHoverKey={setHoverKey}
          onChange={(x) => changeProperty('action', x)}
        />
        <Button type="submit" size="large">
          Save
        </Button>
      </Form>
    </div>
  );
}

interface ActionArrayBuilderProps {
  actions: PlanDefinitionAction[];
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  hoverKey: string | undefined;
  setHoverKey: (key: string | undefined) => void;
  onChange: (actions: PlanDefinitionAction[]) => void;
}

function ActionArrayBuilder(props: ActionArrayBuilderProps): JSX.Element {
  const actionsRef = useRef<PlanDefinitionAction[]>();
  actionsRef.current = props.actions;

  function changeAction(changedAction: PlanDefinitionAction): void {
    props.onChange(
      (actionsRef.current as PlanDefinition[]).map((i) => (i.id === changedAction.id ? changedAction : i))
    );
  }

  function addAction(addedAction: PlanDefinitionAction): void {
    props.onChange([...(actionsRef.current as PlanDefinition[]), addedAction]);
    props.setSelectedKey(addedAction.id);
  }

  function removeAction(removedAction: PlanDefinitionAction): void {
    props.onChange((actionsRef.current as PlanDefinition[]).filter((i) => i !== removedAction));
  }

  return (
    <div className="section">
      {props.actions.map((action) => (
        <div key={action.id}>
          <ActionBuilder
            action={action}
            selectedKey={props.selectedKey}
            setSelectedKey={props.setSelectedKey}
            hoverKey={props.hoverKey}
            setHoverKey={props.setHoverKey}
            onChange={changeAction}
            onRemove={() => removeAction(action)}
          />
        </div>
      ))}
      <div className="bottom-actions">
        <a
          href="#"
          onClick={(e) => {
            killEvent(e);
            addAction({ id: generateId() });
          }}
        >
          Add action
        </a>
      </div>
    </div>
  );
}

interface ActionBuilderProps {
  action: PlanDefinitionAction;
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  hoverKey: string | undefined;
  setHoverKey: (key: string | undefined) => void;
  onChange: (action: PlanDefinitionAction) => void;
  onRemove: () => void;
}

function ActionBuilder(props: ActionBuilderProps): JSX.Element {
  const { action } = props;
  const actionType = getInitialActionType(action);
  const editing = props.selectedKey === props.action.id;
  const hovering = props.hoverKey === props.action.id;

  function onClick(e: React.SyntheticEvent): void {
    e.stopPropagation();
    props.setSelectedKey(props.action.id);
  }

  function onHover(e: React.SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(props.action.id);
  }

  const className = editing ? 'section editing' : hovering ? 'section hovering' : 'section';
  return (
    <div data-testid={action.id} className={className} onClick={onClick} onMouseOver={onHover}>
      {editing ? (
        <ActionEditor
          action={action}
          actionType={actionType}
          onChange={props.onChange}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onRemove={props.onRemove}
        />
      ) : (
        <ActionDisplay action={action} actionType={actionType} />
      )}
      <div className="bottom-actions">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            props.onRemove();
          }}
        >
          Remove
        </a>
      </div>
    </div>
  );
}

const timingProperty: ElementDefinition = {
  path: 'PlanDefinition.action.timing[x]',
  min: 0,
  max: '1',
  type: [{ code: 'dateTime' }, { code: 'Period' }, { code: 'Range' }, { code: 'Timing' }],
};

interface ActionDisplayProps {
  action: PlanDefinitionAction;
  actionType: string | undefined;
}

function ActionDisplay(props: ActionDisplayProps): JSX.Element {
  const { action, actionType } = props;
  const [propertyValue, propertyType] = getActionTiming(action);
  return (
    <div>
      <div>
        {action.title || 'Untitled'} {actionType && `(${actionType})`}
      </div>
      {action.definitionCanonical && (
        <div>
          <ReferenceDisplay value={{ reference: action.definitionCanonical }} />
        </div>
      )}
      {propertyValue && (
        <div>
          <ResourcePropertyDisplay property={timingProperty} propertyType={propertyType} value={propertyValue} />
        </div>
      )}
    </div>
  );
}

interface ActionEditorProps {
  action: PlanDefinitionAction;
  actionType: string | undefined;
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  hoverKey: string | undefined;
  setHoverKey: (key: string | undefined) => void;
  onChange: (action: PlanDefinitionAction) => void;
  onRemove: () => void;
}

function ActionEditor(props: ActionEditorProps): JSX.Element {
  const { action } = props;
  const [actionType, setActionType] = useState<string | undefined>(props.actionType);

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...action,
      [property]: value,
    } as PlanDefinitionAction);
  }

  return (
    <>
      <FormSection title="Title" htmlFor={`actionTitle-${action.id}`}>
        <Input
          name={`actionTitle-${action.id}`}
          defaultValue={action.title}
          onChange={(newValue) => changeProperty('title', newValue)}
        />
      </FormSection>
      <FormSection title="Description" htmlFor={`actionDescription-${action.id}`}>
        <Input
          name={`actionDescription-${action.id}`}
          defaultValue={action.description}
          onChange={(newValue) => changeProperty('description', newValue)}
        />
      </FormSection>
      <FormSection
        title="Type of Action"
        description="The type of the action to be performed."
        htmlFor={`actionType-${action.id}`}
      >
        <Select name={`actionType-${action.id}`} defaultValue={actionType} onChange={setActionType}>
          <option></option>
          <option value="appointment">Appointment</option>
          <option value="lab">Lab</option>
          <option value="questionnaire">Questionnaire</option>
          <option value="task">Task</option>
        </Select>
      </FormSection>
      {action.action && action.action.length > 0 && (
        <ActionArrayBuilder
          actions={action.action}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={(x) => changeProperty('action', x)}
        />
      )}
      {(() => {
        switch (actionType) {
          case 'appointment':
            return (
              <ActionResourceTypeBuilder
                title="Appointment"
                description="The subject must schedule an appointment from the schedule."
                resourceType="Schedule"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'lab':
            return (
              <ActionResourceTypeBuilder
                title="Lab"
                description="The subject must complete the following lab panel."
                resourceType="ActivityDefinition"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'questionnaire':
            return (
              <ActionResourceTypeBuilder
                title="Questionnaire"
                description="The subject must complete the selected questionnaire."
                resourceType="Questionnaire"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'task':
            return (
              <ActionResourceTypeBuilder
                title="Task"
                description="The subject must complete the following task."
                resourceType="ActivityDefinition"
                action={action}
                onChange={props.onChange}
              />
            );
          default:
            return null;
        }
      })()}
      <FormSection title="Timing" description="When the action should take place." htmlFor={'timing-' + action.id}>
        <ActionTimingInput name={'timing-' + action.id} action={action} onChange={props.onChange} />
      </FormSection>
    </>
  );
}

interface ActionResourceTypeBuilderProps {
  action: PlanDefinitionAction;
  title: string;
  description: string;
  resourceType: string;
  onChange: (action: PlanDefinitionAction) => void;
}

function ActionResourceTypeBuilder(props: ActionResourceTypeBuilderProps): JSX.Element {
  const { id, definitionCanonical } = props.action;
  const reference = definitionCanonical?.startsWith(props.resourceType + '/')
    ? { reference: definitionCanonical }
    : undefined;
  return (
    <FormSection title={props.title} description={props.description} htmlFor={id}>
      <ResourceInput
        name={id as string}
        resourceType={props.resourceType}
        defaultValue={reference}
        loadOnFocus={true}
        onChange={(newValue) => {
          if (newValue) {
            props.onChange({ ...props.action, definitionCanonical: getReferenceString(newValue) });
          } else {
            props.onChange({ ...props.action, definitionCanonical: undefined });
          }
        }}
      />
    </FormSection>
  );
}

interface ActionTimingInputProps {
  name: string;
  action: PlanDefinitionAction;
  onChange: (action: PlanDefinitionAction) => void;
}

function ActionTimingInput(props: ActionTimingInputProps): JSX.Element {
  const value = props.action;
  const key = 'timing';
  const [propertyValue, propertyType] = getActionTiming(value);
  return (
    <ResourcePropertyInput
      property={timingProperty}
      name="timing[x]"
      defaultValue={propertyValue}
      defaultPropertyType={propertyType}
      onChange={(newValue: any, propName?: string) => {
        props.onChange(setPropertyValue(value, key, propName ?? key, timingProperty, newValue));
      }}
    />
  );
}

function getInitialActionType(action: PlanDefinitionAction): string | undefined {
  if (action.definitionCanonical?.startsWith('Schedule')) {
    return 'appointment';
  }

  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return 'questionnaire';
  }

  if (action.definitionCanonical?.startsWith('ActivityDefinition/')) {
    return 'task';
  }

  return undefined;
}

function getActionTiming(action: PlanDefinitionAction): [any, PropertyType] {
  return getValueAndType({ type: 'PlanDefinitionAction', value: action }, 'timing');
}

let nextId = 1;

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @return A unique key.
 */
function generateId(existing?: string): string {
  if (existing) {
    if (existing.startsWith('id-')) {
      const existingNum = parseInt(existing.substring(3));
      if (!isNaN(existingNum)) {
        nextId = Math.max(nextId, existingNum + 1);
      }
    }
    return existing;
  }
  return 'id-' + nextId++;
}

function ensurePlanDefinitionKeys(planDefinition: PlanDefinition): PlanDefinition {
  return {
    ...planDefinition,
    action: ensurePlanDefinitionActionKeys(planDefinition.action),
  } as PlanDefinition;
}

function ensurePlanDefinitionActionKeys(
  actions: PlanDefinitionAction[] | undefined
): PlanDefinitionAction[] | undefined {
  if (!actions) {
    return undefined;
  }
  return actions.map((action) => ({
    ...action,
    id: generateId(action.id),
    action: ensurePlanDefinitionActionKeys(action.action),
  }));
}
