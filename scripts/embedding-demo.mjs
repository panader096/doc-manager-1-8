import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'openai/text-embedding-3-small';
const ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

if (!API_KEY) {
  console.error(
    'Missing OPENROUTER_API_KEY. Run this with: node --env-file=.env.local scripts/embedding-demo.mjs'
  );
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const sentence = await rl.question('Type a sentence to embed: ');
rl.close();

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: MODEL, input: sentence }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`OpenRouter request failed (${response.status}): ${errorText}`);
  process.exit(1);
}

const result = await response.json();
const embedding = result.data[0].embedding;

console.log(`\nModel: ${MODEL}`);
console.log(`Dimensions: ${embedding.length}\n`);
console.log(embedding);
