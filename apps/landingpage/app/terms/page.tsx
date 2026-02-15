import Link from "next/link";

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-neutral-500 mb-10">Last updated: February 2026</p>

          <p className="mb-8 leading-relaxed">
            By using UniMemory, you agree to these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the service.
          </p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">1. Description of Service</h2>
            <p className="leading-relaxed">
              UniMemory provides a personal knowledge and memory service that allows users to save, search, and retrieve their own information inside ChatGPT using secure integrations.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">2. User Responsibilities</h2>
            <p className="mb-4">You agree that:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You will only upload content you have the right to use</li>
              <li>You are responsible for the accuracy of the content you save</li>
              <li>You will not use UniMemory for illegal or harmful activities</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">3. Ownership of Content</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You retain full ownership of all content you submit.</li>
              <li>UniMemory does not claim ownership over your data.</li>
              <li>We only process your content to provide the service.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">4. Acceptable Use</h2>
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Upload unlawful, abusive, or malicious content</li>
              <li>Attempt to access other users&apos; data</li>
              <li>Reverse engineer or abuse the service</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">5. Availability &amp; Changes</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>The service is provided on an &quot;as-is&quot; basis.</li>
              <li>Features may evolve over time.</li>
              <li>We may update or discontinue parts of the service.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">6. Limitation of Liability</h2>
            <p className="mb-4">To the maximum extent permitted by law:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>UniMemory is not liable for indirect or consequential damages</li>
              <li>We do not guarantee that stored information will always be available or error-free</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">7. Termination</h2>
            <p className="leading-relaxed">
              You may stop using UniMemory at any time by disconnecting the app. We reserve the right to suspend access if these Terms are violated.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">8. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms are governed by the laws applicable in your jurisdiction, without regard to conflict of law principles.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-white mb-4">9. Contact</h2>
            <p className="leading-relaxed">
              For questions about these Terms:{" "}
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
