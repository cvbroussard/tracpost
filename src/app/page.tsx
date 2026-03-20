import Link from "next/link";
import { studioUrl } from "@/lib/subdomains";

export default function Home() {
  const loginHref = studioUrl("/login");

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="TracPost" className="h-6 w-6" />
          <span className="font-semibold tracking-wider">TRACPOST</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={loginHref} className="text-sm text-muted hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="#pricing"
            className="bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-16 text-center md:pt-24">
        <h1 style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
          From your camera to<br />8 platforms in minutes
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted" style={{ lineHeight: 1.6 }}>
          TracPost is your managed content engine. Capture photos of your work — we handle the
          brand strategy, captions, publishing, blog, and SEO. Automatically.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="#pricing"
            className="bg-accent px-6 py-3 text-sm font-medium text-white"
          >
            Start 14-day free trial
          </Link>
          <Link
            href="#how"
            className="border border-border px-6 py-3 text-sm text-muted hover:text-foreground"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border px-6 py-24 md:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center" style={{ fontSize: 32, fontWeight: 500 }}>
            You capture. We do everything else.
          </h2>
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            <div>
              <p className="mb-3 text-3xl">1</p>
              <h3 className="mb-2" style={{ fontSize: 20, fontWeight: 600 }}>Capture</h3>
              <p className="text-muted">
                Take photos and videos of your work with TracPost Studio on your phone.
                Add a quick note about what&apos;s happening.
              </p>
            </div>
            <div>
              <p className="mb-3 text-3xl">2</p>
              <h3 className="mb-2" style={{ fontSize: 20, fontWeight: 600 }}>Pipeline</h3>
              <p className="text-muted">
                AI evaluates your content, writes platform-specific captions, generates blog posts,
                and schedules everything across Instagram, TikTok, Facebook, Twitter, YouTube,
                Pinterest, LinkedIn, and Google Business.
              </p>
            </div>
            <div>
              <p className="mb-3 text-3xl">3</p>
              <h3 className="mb-2" style={{ fontSize: 20, fontWeight: 600 }}>Results</h3>
              <p className="text-muted">
                Your social accounts stay active, your blog ranks on Google, and clients
                find you when they search for what you do. You focus on your craft.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-border px-6 py-24 md:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center" style={{ fontSize: 32, fontWeight: 500 }}>
            A marketing department that runs on autopilot
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {[
              { title: "8-Platform Publishing", desc: "Instagram, TikTok, Facebook, Twitter/X, YouTube, Pinterest, LinkedIn, Google Business — all managed from one capture." },
              { title: "Brand Intelligence", desc: "AI researches your market, builds your brand playbook, and generates content that sounds like you — not a robot." },
              { title: "Blog & SEO Engine", desc: "Auto-generated blog posts with inline images, authority links, and schema markup. Your own SEO-optimized microsite." },
              { title: "Cast of Characters", desc: "AI recognizes recurring subjects in your photos and weaves their stories into your content. Every post builds a narrative." },
              { title: "Mobile Capture App", desc: "TracPost Studio on your iPhone. Snap photos at work, add context, upload. The pipeline does the rest in minutes." },
              { title: "Managed Accounts", desc: "We create and optimize your social profiles. You don't need to know the difference between a Business Account and a Page." },
            ].map((f) => (
              <div key={f.title}>
                <h3 className="mb-2" style={{ fontSize: 18, fontWeight: 600 }}>{f.title}</h3>
                <p className="text-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border px-6 py-24 md:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-center" style={{ fontSize: 32, fontWeight: 500 }}>
            Simple pricing
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted">
            Both plans include all 8 platforms, the mobile app, brand intelligence, and managed account setup. Start with a 14-day free trial.
          </p>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Growth */}
            <div className="border border-border p-8">
              <h3 className="mb-1" style={{ fontSize: 24, fontWeight: 600 }}>Growth</h3>
              <p className="mb-6 text-muted">Your content engine, running.</p>
              <p className="mb-6">
                <span style={{ fontSize: 48, fontWeight: 600 }}>$99</span>
                <span className="text-muted">/month</span>
              </p>
              <ul className="mb-8 space-y-2 text-sm">
                <li>10 blog posts per month</li>
                <li>4 topic clusters</li>
                <li>5 personas (Cast of Characters)</li>
                <li>Monthly SEO audit</li>
                <li>1 site (channel)</li>
                <li>Autopilot publishing</li>
              </ul>
              <Link
                href="https://buy.stripe.com/test_growth"
                className="block w-full bg-accent py-3 text-center text-sm font-medium text-white"
              >
                Start 14-day free trial
              </Link>
            </div>

            {/* Authority */}
            <div className="border border-accent p-8">
              <h3 className="mb-1" style={{ fontSize: 24, fontWeight: 600 }}>Authority</h3>
              <p className="mb-6 text-muted">Own your category.</p>
              <p className="mb-6">
                <span style={{ fontSize: 48, fontWeight: 600 }}>$219</span>
                <span className="text-muted">/month</span>
              </p>
              <ul className="mb-8 space-y-2 text-sm">
                <li>Unlimited blog posts</li>
                <li>All topic clusters</li>
                <li>Unlimited personas</li>
                <li>Weekly SEO audit</li>
                <li>Up to 5 sites (channels)</li>
                <li>Manual scheduling control</li>
                <li>Blog import with redirect preservation</li>
              </ul>
              <Link
                href="https://buy.stripe.com/test_authority"
                className="block w-full bg-foreground py-3 text-center text-sm font-medium text-background"
              >
                Start 14-day free trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Expected impact */}
      <section className="border-t border-border px-6 py-24 md:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-12" style={{ fontSize: 32, fontWeight: 500 }}>
            What to expect
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 text-left">
            <div>
              <h3 className="mb-2" style={{ fontSize: 18, fontWeight: 600 }}>Growth</h3>
              <p className="text-muted">
                Google starts recognizing you as a subject matter authority in 4 areas.
                Your blog drives organic traffic within 60-90 days. Character-driven content
                builds trust before the first phone call. SEO audits catch issues before they
                cost you rankings.
              </p>
            </div>
            <div>
              <h3 className="mb-2" style={{ fontSize: 18, fontWeight: 600 }}>Authority</h3>
              <p className="text-muted">
                You become the most-published, most-indexed business in your niche locally.
                Every search query related to your service finds your content. Competitors
                wonder how you&apos;re everywhere. Domain authority compounds — the longer
                you run, the harder you are to displace.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-12 md:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="TracPost" className="h-5 w-5" />
            <span className="text-sm text-muted">TracPost</span>
          </div>
          <div className="flex gap-6 text-sm text-muted">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <a href="mailto:support@tracpost.com" className="hover:text-foreground">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
