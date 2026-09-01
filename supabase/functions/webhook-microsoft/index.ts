import { handleMicrosoftWebhook } from './handler.ts';

Deno.serve((request) => handleMicrosoftWebhook(request));
