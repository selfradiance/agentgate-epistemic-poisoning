import Anthropic from '@anthropic-ai/sdk';

// Single shared Anthropic SDK instance (pattern from Agent 005)
const client = new Anthropic();

export const MODEL = 'claude-sonnet-4-20250514';
export default client;
