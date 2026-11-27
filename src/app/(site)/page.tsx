import type { Metadata } from "next";
import Link from "next/link";
import { AccountButtons, HashForward, MobileMenu, Pricing, SiteFooterContacts } from "@/components/site/WebsiteBits";

export const metadata: Metadata = {
  title: "AutoPulse Connect | AI chat and one inbox for car dealerships",
  description:
    "AI website chat that knows your live inventory, and one inbox for website chat, WhatsApp, SMS, Messenger and Instagram. Leads and visit bookings go straight to your team and your CRM.",
};

const CHANNELS = [
  ["website", "Website chat"],
  ["whatsapp", "WhatsApp"],
  ["sms", "SMS"],
  ["messenger", "Messenger"],
  ["instagram", "Instagram"],
];

const FEATURES: { title: string; text: string; img: string }[] = [
  {
    title: "AI that knows every car on your lot",
    text: "The website chat answers from your live inventory, VIN by VIN: price, miles, features. Shoppers browse the Cars tab, save cars and ask about them, 24/7.",
    img: "/manual/img/39-widget-cars.jpg",
  },
  {
    title: "One inbox for every channel",
    text: "Website chat, WhatsApp, SMS, Messenger and Instagram in one place. Your team sees the whole conversation and the AI steps back the moment a person replies.",
    img: "/manual/img/04-inbox.jpg",
  },
  {
    title: "Leads and visits, straight to your team",
    text: "Customers ask about a car or book a visit from the chat. Each lead is saved with the car and sent to your CRM as ADF, and your team gets an alert.",
    img: "/manual/img/12-leads.jpg",
  },
  {
    title: "Your team, your departments",
    text: "Sales, service, parts, finance, trade-in. New chats go to the right department and the right person. Managers see everything and can step in.",
    img: "/manual/img/31-team.jpg",
  },
  {
    title: "Know who is on your website",
    text: "See visitors as they browse: the cars they look at, where they came from, and when they come back. Start a chat at the right moment.",
    img: "/manual/img/19-visitors.jpg",
  },
  {
    title: "Pages and QR codes for every salesperson",
    text: "A page for the dealership and one for each person, with every way to reach them and a QR code for business cards and window stickers.",
    img: "/manual/img/35-dealership-page.jpg",
  },
];

const MORE = [
  ["Fully branded", "Your logo, colours, greeting and pop-ups on the chat."],
  ["Your feed and your own cars", "Use your AutoPulse inventory feed, add your own cars, or both."],
  ["Car pages that sell", "Every car gets a clean page with photos, price and a chat button."],
  ["Works with AutoPulse CRM", "Your CRM team signs in with the login they already have."],
  ["Hand-offs that make sense", "Ask a colleague, transfer to a person or a queue, or give the chat back to the AI."],
  ["Clear reports", "Messages, leads, visits and replies by day and by channel."],
];

const FAQ: [string, string][] = [
  ["What is AutoPulse Connect?", "AI chat for your website plus one inbox for website chat, WhatsApp, SMS, Messenger and Instagram, built for car dealerships. The AI answers from your live inventory; your team takes over whenever they want."],
  ["How does the AI know my cars?", "It reads your AutoPulse inventory feed (and any cars you add yourself), so it answers with the real price, miles and details of each VIN, and sends a link to the car's page."],
  ["Do I need to change my website?", "No. You paste one line of code into your website (or ask your website company to). The chat appears in the corner with your colours and logo."],
  ["Can my team reply from the same place?", "Yes. Everyone works in one inbox. When a person replies, the AI stops for that chat. You can hand a chat to a colleague, a department or back to the AI."],
  ["Does it work with my CRM?", "Yes. Leads and visit bookings are sent to your CRM as ADF e-mails, the format dealer CRMs read. AutoPulse CRM dealers also get their team and inventory automatically."],
  ["Which channels are included?", "Website chat from day one. WhatsApp, SMS, Messenger and Instagram are connected by AutoPulse for your dealership."],
  ["Can I turn the AI off?", "Yes, for the whole store or one channel at a time. Your team can always reply."],
  ["How long does it take to set up?", "Minutes. Create your account, choose your colours and departments, paste the code. We help you every step of the way."],
];

export default function Home() {
  return (
    <>
      <HashForward />
      <header className="site-header">
        <div className="site-wrap site-header-row">
          <Link className="site-logo" href="/" aria-label="AutoPulse Connect">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.svg" alt="" width={30} height={30} />
            <span>AutoPulse <b>Connect</b></span>
          </Link>
          <nav className="site-nav" aria-label="Website">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/contact">Contact</a>
          </nav>
          <div className="site-actions">
            <AccountButtons />
            <MobileMenu />
          </div>
        </div>
      </header>

      <main>
        <section className="site-hero">
          <div className="site-wrap site-hero-grid">
            <div>
              <p className="site-eyebrow">AI-powered solutions for dealership growth</p>
              <h1>Every customer conversation in one inbox, with AI that knows your inventory.</h1>
              <p className="site-lead">
                AutoPulse Connect answers shoppers on your website 24/7 from your live stock, and brings website chat, WhatsApp, SMS,
                Messenger and Instagram together for your team. More leads, faster replies, no missed chats.
              </p>
              <div className="site-cta-row">
                <a className="site-btn site-btn-primary site-btn-lg" href="/demo">Book a demo</a>
                <a className="site-btn site-btn-lg" href="/signup">Create account</a>
              </div>
              <ul className="site-channels" aria-label="Channels">
                {CHANNELS.map(([id, label]) => (
                  <li key={id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/icon-${id}.svg`} alt="" width={18} height={18} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="site-hero-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="site-shot-main" src="/manual/img/04-inbox.jpg" alt="The AutoPulse Connect inbox" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="site-shot-float" src="/manual/img/40-widget-chat.jpg" alt="The website chat answering a shopper" />
            </div>
          </div>
        </section>

        <section id="features" className="site-section">
          <div className="site-wrap">
            <p className="site-eyebrow">Features</p>
            <h2>Built for car dealers, from the first question to the test drive</h2>
            <div className="site-features">
              {FEATURES.map((f) => (
                <article key={f.title} className="site-feature">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.img} alt="" loading="lazy" />
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
            <div className="site-more">
              {MORE.map(([t, d]) => (
                <div key={t}>
                  <h4>{t}</h4>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="site-section site-alt">
          <div className="site-wrap">
            <p className="site-eyebrow">How it works</p>
            <h2>Live in three steps</h2>
            <ol className="site-steps">
              <li>
                <span>1</span>
                <h3>Create your account</h3>
                <p>Sign up with your dealership name and website. Your inventory is found from your website.</p>
              </li>
              <li>
                <span>2</span>
                <h3>Make it yours</h3>
                <p>Choose your colours, logo, greeting and departments, and add your team.</p>
              </li>
              <li>
                <span>3</span>
                <h3>Paste one line of code</h3>
                <p>Add the chat to your website. Chats, leads and visits start coming into your inbox.</p>
              </li>
            </ol>
            <div className="site-cta-row site-center">
              <a className="site-btn site-btn-primary site-btn-lg" href="/signup">Get started</a>
              <a className="site-btn site-btn-lg" href="/demo">See it in a demo</a>
            </div>
          </div>
        </section>

        <section className="site-section">
          <div className="site-wrap">
            <p className="site-eyebrow">Why AutoPulse</p>
            <h2>More than a chatbot</h2>
            <div className="site-compare">
              <div className="site-compare-col">
                <h3>A normal chatbot</h3>
                <ul className="site-crosses">
                  <li>Little or no inventory search</li>
                  <li>General answers from a script</li>
                  <li>Website only</li>
                  <li>Leads copied by hand</li>
                  <li>No hand-off to your team</li>
                  <li>No idea who is on your website</li>
                </ul>
              </div>
              <div className="site-compare-col site-compare-us">
                <h3>AutoPulse Connect</h3>
                <ul className="site-ticks">
                  <li>Live inventory, answers for every VIN</li>
                  <li>Understands what the shopper wants</li>
                  <li>Website chat, WhatsApp, SMS, Messenger, Instagram</li>
                  <li>Leads and visits saved and sent to your CRM</li>
                  <li>Your team steps in with one click</li>
                  <li>Visitors, cars viewed and return visits</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="site-section site-alt">
          <div className="site-wrap">
            <p className="site-eyebrow">Pricing</p>
            <h2>Simple monthly pricing</h2>
            <p className="site-sub">Pay monthly by card. Everything below is included.</p>
            <Pricing />
          </div>
        </section>

        <section id="faq" className="site-section">
          <div className="site-wrap site-narrow">
            <p className="site-eyebrow">FAQ</p>
            <h2>Frequently asked questions</h2>
            <div className="site-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="site-band">
          <div className="site-wrap site-band-row">
            <div>
              <h2>See AutoPulse Connect on your own inventory</h2>
              <p>A short demo with your website and your cars.</p>
            </div>
            <a className="site-btn site-btn-light site-btn-lg" href="/demo">Book a demo</a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-wrap site-foot-grid">
          <div className="site-foot-col">
            <Link className="site-logo" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/logo.svg" alt="" width={26} height={26} />
              <span>AutoPulse <b>Connect</b></span>
            </Link>
            <p className="site-muted">AI-powered solutions for dealership growth.</p>
          </div>
          <div className="site-foot-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="/manual">User manual</a>
            <a href="/demo">Book a demo</a>
          </div>
          <div className="site-foot-col">
            <h4>Account</h4>
            <a href="/login">Sign in</a>
            <a href="/signup">Create account</a>
            <a href="/forgot-password">Forgot password</a>
          </div>
          <SiteFooterContacts />
        </div>
        <div className="site-wrap site-foot-bottom">
          <span>© 2026 AutoPulse AI</span>
          <span>
            <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a>
          </span>
        </div>
      </footer>
    </>
  );
}
