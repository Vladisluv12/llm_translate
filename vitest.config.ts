import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __EXT_API_URL__: JSON.stringify('http://localhost:11434/v1/chat/completions'),
    __EXT_API_KEY__: JSON.stringify(''),
    __EXT_MODEL__: JSON.stringify('llama3.1'),
  },
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
