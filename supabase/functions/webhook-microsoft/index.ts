import { handleMicrosoftWebhook } from './handler.ts';

Deno.serve(handleMicrosoftWebhook);
