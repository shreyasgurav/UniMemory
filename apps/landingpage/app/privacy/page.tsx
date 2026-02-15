import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="bg-black min-h-screen flex flex-col selection:bg-neutral-800 selection:text-white">
      <header className="px-6 py-4 sticky top-0 z-50 glass-nav">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <Link href="/">
            <img
              src="/Unimemory Name Logo NoBG.png"
              alt="UniMemory"
              className="h-10 w-auto brightness-0 invert hover:opacity-90 transition-opacity"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto text-neutral-300">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-neutral-500 mb-10">Last updated: February 2026</p>

          <p className="mb-8 leading-relaxed">
            UniMemory (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) provides a personal knowledge and memory service that allows users to save, search, and retrieve their own information inside ChatGPT. Your privacy is important to us, and this policy explains what data we collect, how it is used, and how it is protected.
          </p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">1. Information We Collect</h2>
            <p className="mb-4">UniMemory only processes data that you explicitly provide.</p>
            <h3 className="text-base font-medium text-neutral-200 mb-2">a. Content You Choose to Save</h3>
            <p className="mb-4">When you use UniMemory, you may choose to save:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>Conversations</li>
              <li>Notes</li>
              <li>Documents</li>
              <li>Summaries or project-related information</li>
            </ul>
            <p className="mb-4">This content is stored solely to provide memory, search, and retrieval functionality.</p>
            <h3 className="text-base font-medium text-neutral-200 mb-2">b. Account &amp; Technical Information</h3>
            <p className="mb-4">To operate the service securely, we may process:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>A unique user identifier provided by ChatGPT or OAuth authentication</li>
              <li>Basic technical metadata (timestamps, tool usage counts)</li>
            </ul>
            <p className="mb-2">We do not collect:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>Passwords</li>
              <li>Payment information</li>
              <li>Contacts</li>
              <li>Location data</li>
              <li>Browsing history outside UniMemory</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">Your data is used only to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>Store your personal knowledge</li>
              <li>Enable semantic search and retrieval</li>
              <li>Generate summaries and extracted memories</li>
              <li>Organize content by projects (if you choose)</li>
            </ul>
            <p className="mb-2">We do not:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>Sell user data</li>
              <li>Share data with advertisers</li>
              <li>Use your data to train public AI models</li>
              <li>Access your data without your request</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">3. Data Sharing</h2>
            <p className="leading-relaxed">
              UniMemory does not share your data with third parties except when required to operate the service (e.g., secure infrastructure providers) or when legally required to comply with applicable law. All data access is scoped to the authenticated user.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">4. Data Storage &amp; Security</h2>
            <p className="mb-4">We take reasonable technical and organizational measures to protect your data, including:</p>
            <ul className="list-disc pl-6 mb-4 space-y-1">
              <li>Secure authentication</li>
              <li>Access control</li>
              <li>Encrypted connections (HTTPS)</li>
            </ul>
            <p className="leading-relaxed">Your saved content is private by default and accessible only to you.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Retention &amp; Deletion</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your data is retained for as long as you choose to keep it.</li>
              <li>You may delete content or disconnect UniMemory at any time.</li>
              <li>Disconnecting the app immediately revokes access from ChatGPT.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights</h2>
            <p className="leading-relaxed">
              Depending on your location, you may have the right to access your stored data, request deletion of your data, and disconnect the app at any time.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">7. Children&apos;s Privacy</h2>
            <p className="leading-relaxed">
              UniMemory is not intended for use by children under 13. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">8. Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. Updates will be reflected on this page with a revised &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">9. Contact</h2>
            <p className="leading-relaxed">
              If you have questions about this Privacy Policy, contact:{" "}
              <a href="mailto:shrreyasgurav@gmail.com" className="text-neutral-200 underline hover:text-white transition-colors">
                shrreyasgurav@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="px-6 py-6 glass-nav-footer">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/Unimemory Name Logo NoBG.png"
              alt="UniMemory"
              className="h-8 w-auto opacity-80 hover:opacity-100 transition-opacity brightness-0 invert"
            />
          </Link>
          <div className="flex items-center gap-6 text-sm text-neutral-400">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
