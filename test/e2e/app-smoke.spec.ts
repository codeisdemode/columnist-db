import { expect, test } from '@playwright/test';

test.describe('Columnist demo smoke tests', () => {
  test('research assistant can add a sample paper', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Columnist-DB Demos' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Sample Paper' }).click();

    await expect(page.getByText('Machine Learning in Healthcare')).toBeVisible();
    await expect(page.getByRole('button', { name: /Papers \(1\)/ })).toBeVisible();
  });

  test('chat demo can answer from local documents', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.getByRole('heading', { name: 'AI Chat with Knowledge Base' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Sample Docs' }).click();

    await expect(page.getByText('3 documents')).toBeVisible();

    const prompt = 'What is Columnist-DB?';
    await page.getByPlaceholder('Ask a question about your documents...').fill(prompt);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Based on my knowledge base:', { exact: false })).toBeVisible();
    await expect(page.getByText('Sources:', { exact: true })).toBeVisible();
  });

  test('enhanced chat MCP panel runs local tool actions', async ({ page }) => {
    await page.goto('/chat-enhanced');

    await expect(page.getByRole('heading', { name: 'AI Chat with LLM + Knowledge Base' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Sample Docs' }).click();
    await page.getByRole('button', { name: /MCP Server/ }).click();

    await page.getByTestId('mcp-call-get_research_summary').click();

    await expect(page.getByRole('heading', { name: 'Tool Results' })).toBeVisible();
    await expect(page.getByText('"documents": 3')).toBeVisible();
  });
});
