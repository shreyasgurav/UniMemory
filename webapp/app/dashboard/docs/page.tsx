"use client";

export default function DocsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">Documentation</h1>
        <p className="text-sm text-neutral-500">Complete setup and configuration guide</p>
      </div>

      <div className="space-y-8">
        {/* Quick Start */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Quick Start</h2>
          <div className="space-y-4 text-sm text-neutral-700">
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">1. Create an API Key</h3>
              <p className="text-neutral-600">Go to the API Keys page and create a new API key. Save it securely - you won't be able to see it again.</p>
            </div>
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">2. Install the SDK</h3>
              <p className="text-neutral-600 mb-2">Choose your preferred language:</p>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                <code>{`npm install @unimemory/js
pip install unimemory`}</code>
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">3. Initialize the Client</h3>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                <code>{`// JavaScript/TypeScript
import UniMemory from '@unimemory/js';
const client = new UniMemory('your-api-key');

// Python
from unimemory import UniMemory
client = UniMemory(api_key="your-api-key")`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">API Reference</h2>
          <div className="space-y-6 text-sm">
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">Add Memory</h3>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-2">
                <code>{`await client.addMemory({
  content: "Remember this...",
  user_id: "user123"
});`}</code>
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">Search Memories</h3>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-2">
                <code>{`const results = await client.searchMemories({
  query: "What did I learn about...",
  user_id: "user123",
  limit: 10
});`}</code>
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">List Memories</h3>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto mb-2">
                <code>{`const memories = await client.listMemories({
  user_id: "user123",
  limit: 50
});`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Authentication</h2>
          <div className="space-y-4 text-sm text-neutral-700">
            <p>All API requests require authentication using an API key. Include your API key in the request headers:</p>
            <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
              <code>X-API-Key: your-api-key-here</code>
            </pre>
            <p className="text-neutral-600">Keep your API keys secure. Never commit them to version control or expose them in client-side code.</p>
          </div>
        </section>

        {/* Configuration */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Configuration</h2>
          <div className="space-y-4 text-sm text-neutral-700">
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">Base URL</h3>
              <p className="text-neutral-600 mb-2">Default API endpoint:</p>
              <pre className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs font-mono overflow-x-auto">
                <code>https://unimemory.up.railway.app/api/v1</code>
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-neutral-900 mb-2">Rate Limits</h3>
              <p className="text-neutral-600">Rate limits apply based on your plan. Check your plan details in the Settings page.</p>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Best Practices</h2>
          <div className="space-y-3 text-sm text-neutral-700">
            <div className="flex gap-3">
              <span className="text-neutral-400">•</span>
              <p>Store API keys securely using environment variables</p>
            </div>
            <div className="flex gap-3">
              <span className="text-neutral-400">•</span>
              <p>Use unique user_id values to separate data between users</p>
            </div>
            <div className="flex gap-3">
              <span className="text-neutral-400">•</span>
              <p>Keep memory content concise and meaningful</p>
            </div>
            <div className="flex gap-3">
              <span className="text-neutral-400">•</span>
              <p>Regularly review and delete unused API keys</p>
            </div>
            <div className="flex gap-3">
              <span className="text-neutral-400">•</span>
              <p>Handle API errors gracefully in your application</p>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Support</h2>
          <div className="space-y-3 text-sm text-neutral-700">
            <p className="text-neutral-600">For questions, issues, or feature requests, please contact support or check the GitHub repository.</p>
          </div>
        </section>
      </div>
    </div>
  );
}