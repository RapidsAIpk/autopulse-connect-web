import Script from "next/script";
import { Providers } from "@/store/Providers";

/**
 * The <html>/<body> every old page had: theme.js runs before paint (no flash), the old stylesheet is linked
 * as-is, and help.js (hover tips, "?" icons, tours) loads unchanged once the page has rendered.
 */
export function PageShell({
  bodyClass,
  help = true,
  theme = true,
  stylesheet = "/assets/styles.css?v=124",
  robots,
  children,
}: {
  bodyClass?: string;
  help?: boolean;
  theme?: boolean;
  stylesheet?: string;
  robots?: string;
  children: React.ReactNode;
}) {
  return (
    // theme.js sets data-theme on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      {/* App Router root layouts own <head>; these two rules target the Pages Router. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        {robots ? <meta name="robots" content={robots} /> : null}
        {theme ? (
          // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
          <Script src="/assets/theme.js?v=1" strategy="beforeInteractive" />
        ) : null}
        <link rel="stylesheet" href={stylesheet} />
      </head>
      <body className={bodyClass}>
        <Providers>{children}</Providers>
        {help ? <Script src="/assets/help.js?v=18" type="module" strategy="lazyOnload" /> : null}
      </body>
    </html>
  );
}
