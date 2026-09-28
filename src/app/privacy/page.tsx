export const metadata = {
 title: "Privacy Policy — VSI",
};

export default function PrivacyPage() {
 return (
 <div className="min-h-screen bg-gray-50 py-12 px-6">
 <div className="max-w-2xl mx-auto bg-card rounded-[20px] border border-gray-200 p-8 text-gray-800">
 <h1 className="text-2xl font-semibold text-gray-900 mb-2">Privacy Policy</h1>
 <p className="text-xs text-gray-500 mb-6">Last updated: 22 May 2026</p>

 <section className="space-y-5 text-sm leading-relaxed">
 <p>
 ValGrow Search Intelligence (VSI) is a multi-tenant SEO analytics
 platform used by agencies to track search visibility for their
 clients. This page describes how VSI and the VSI Browser Capture
 Chrome extension handle data.
 </p>

 <h2 className="text-base font-semibold text-gray-900 pt-3">What we collect</h2>
 <ul className="list-disc pl-5 space-y-1">
 <li>
 <strong>Account information:</strong> name, email, and password
 hash for users registered on the VSI dashboard.
 </li>
 <li>
 <strong>Keyword and client metadata:</strong> the search keywords,
 client websites, and brand names you choose to track.
 </li>
 <li>
 <strong>Search result snapshots:</strong> data captured from
 public Google search pages — rank positions, AI Overview
 answers, cited URLs, and SERP titles.
 </li>
 </ul>

 <h2 className="text-base font-semibold text-gray-900 pt-3">What we do not do</h2>
 <ul className="list-disc pl-5 space-y-1">
 <li>We do not sell any data to third parties.</li>
 <li>We do not share your data with other agencies on the platform.</li>
 <li>We do not use your data to train AI Overviewls.</li>
 <li>We do not place advertising cookies.</li>
 </ul>

 <h2 className="text-base font-semibold text-gray-900 pt-3">Third-party services</h2>
 <p>
 VSI relies on trusted cloud infrastructure providers for
 authentication, data storage, and AI-powered analysis. These
 providers receive only the minimum data required to perform their
 function and are bound by their own privacy policies. No
 personally identifiable information beyond what you submit at
 sign-up is shared.
 </p>

 <h2 className="text-base font-semibold text-gray-900 pt-3">Data retention</h2>
 <p>
 Snapshots are retained for the lifetime of your account so you can
 view historical trends. You may request deletion of your account
 and all associated data at any time by emailing
 {" "}<a className="text-amber-700 hover:underline" href="mailto:valgrowdigital@gmail.com">
 valgrowdigital@gmail.com
 </a>.
 </p>

 <h2 className="text-base font-semibold text-gray-900 pt-3">Contact</h2>
 <p>
 Questions about this policy:{" "}
 <a className="text-amber-700 hover:underline" href="mailto:valgrowdigital@gmail.com">
 valgrowdigital@gmail.com
 </a>
 </p>
 </section>
 </div>
 </div>
 );
}
