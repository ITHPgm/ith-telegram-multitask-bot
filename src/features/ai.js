import { config } from '../config.js';

export async function askAi(prompt, mode = 'answer') {
  if (!config.openAiKey) throw new Error('The AI feature is not configured yet. Add OPENAI_API_KEY to your environment variables.');
  if (!prompt || prompt.length > 12000) throw new Error('Please provide a prompt of up to 12,000 characters.');

  const instruction = mode === 'summarize'
    ? 'Summarize the user-provided material. Preserve key facts and do not invent details. Use concise headings or bullets when useful.'
    : 'Answer clearly and accurately. State uncertainty when needed. Do not claim to have performed actions outside this chat.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openAiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openAiModel,
      instructions: instruction,
      input: prompt,
      max_output_tokens: 900
    }),
    signal: AbortSignal.timeout(25000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `AI provider error (${response.status}).`;
    throw new Error(message.slice(0, 300));
  }
  const output = (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('\n')
    .trim();
  if (!output) throw new Error('The AI provider returned an empty response. Please try again.');
  return output.slice(0, 3900);
}
