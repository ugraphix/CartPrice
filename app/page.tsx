import Image from "next/image";
import Link from "next/link";
import { CompareExperience } from "@/components/CompareExperience";

const workflow = [
  "Start with a ZIP code or your current browser location.",
  "Build the cart with free-text grocery items and quick suggestions.",
  "Compare nearby stores by final total, open-now status, and pricing coverage.",
];

const useCases = [
  {
    title: "Phone-first when shopping",
    copy: "The website stays responsive enough to use in the parking lot or aisle when someone wants a quick answer.",
  },
  {
    title: "Desktop-friendly at work",
    copy: "People can build a basket and compare stores from a laptop without needing to switch over to a separate app flow.",
  },
  {
    title: "Transparent when data is missing",
    copy: "Unsupported nearby stores are still shown so the website feels honest instead of pretending every chain has live pricing.",
  },
];

export default function HomePage() {
  return (
    <main className="functional-home">
      <div className="top-nav-wrap">
        <nav className="top-nav">
          <Link href="/" className="brand-link">
            <Image src="/cartprice-app-icon.png" alt="CartPrice app icon" width={34} height={34} />
            <span>CartPrice</span>
          </Link>
          <div className="nav-links">
            <a href="#compare-tool">Compare</a>
            <a href="#results">Results</a>
            <a href="#how-it-works">How it works</a>
          </div>
        </nav>
      </div>
      <CompareExperience
        heroAside={
          <ul className="functional-stats-list">
            <li>
              <strong>Compare real totals, not shelf guesses</strong>
              <span>See taxes, bag fees, and local charges before you shop.</span>
            </li>
            <li>
              <strong>Choose the right store before your trip</strong>
              <span>Know which nearby option best fits your list and budget.</span>
            </li>
            <li>
              <strong>Plan meals with a clearer budget</strong>
              <span>Price out a full grocery run before you leave home.</span>
            </li>
            <li>
              <strong>Avoid wasted trips and surprise prices</strong>
              <span>See if a store is open, has pricing data, and fits your budget before you go.</span>
            </li>
          </ul>
        }
      />

      <section id="how-it-works" className="page-shell story-grid functional-story-grid">
        <div className="story-panel">
          <span className="eyebrow">How to use it</span>
          <h2>A website flow that behaves like a working shopping tool.</h2>
          <ol className="step-list">
            {workflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="story-panel emphasis">
          <span className="eyebrow">Why this works better</span>
          <h2>It supports the moments when people actually need it.</h2>
          <div className="audience-list">
            {useCases.map((useCase) => (
              <article key={useCase.title}>
                <h3>{useCase.title}</h3>
                <p>{useCase.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
