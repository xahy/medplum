import { badRequest } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { tryLogin } from '../oauth/utils';
import { sendLoginResult } from './utils';

export const loginValidators = [
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  // Project ID can come from one of two sources
  // 1) Passed in explicitly as projectId
  // 2) Implicit with clientId
  // The only rule is that they have to match
  let projectId = req.body.projectId as string | undefined;

  // For OAuth2 flow, check the clientId
  const clientId = req.body.clientId;
  if (clientId) {
    const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
    const clientProjectId = client.meta?.project as string;
    if (projectId !== undefined && projectId !== clientProjectId) {
      sendOutcome(res, badRequest('Invalid projectId'));
      return;
    }
    projectId = clientProjectId;
  }

  const login = await tryLogin({
    authMethod: 'password',
    clientId,
    projectId,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    email: req.body.email,
    password: req.body.password,
    remember: req.body.remember,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  await sendLoginResult(res, login, projectId);
}
