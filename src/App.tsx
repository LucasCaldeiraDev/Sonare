import { BrandsAndAreaSection } from "./components/BrandsAndAreaSection";
import { ClosingOverlay, ClosingSection } from "./components/ClosingMoment";
import { ContactSection } from "./components/ContactSection";
import { DifferentiatorsSection } from "./components/DifferentiatorsSection";
import { Footer } from "./components/Footer";
import { HeroOverlay } from "./components/HeroOverlay";
import { Journey } from "./components/Journey";
import { Navbar } from "./components/Navbar";
import { S110Section } from "./components/S110Section";
import { SolutionsSection } from "./components/SolutionsSection";

/**
 * Page structure — one uninterrupted cinematic journey, then the commentary.
 *
 *   Approach (`#experiencia`): nighttime facade → living / home cinema.
 *   Journey  (`#jornada`):     a single merged master carrying the S110
 *                              approach, the close-up, the crossing THROUGH the
 *                              interface, the gourmet reveal, the curtains and
 *                              the closing skyline. Nothing interrupts it — no
 *                              editorial section, no crossfade between files.
 *   Only afterwards does the S110 get its written spotlight, followed by the
 *   commercial sections in normal document flow.
 */
function App() {


  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <Navbar />
      <main id="inicio">
        {/* One continuous journey: four files, one global timeline, one canvas. */}
        <Journey
          id="experiencia"
          settle={2.0}
          hero={<HeroOverlay />}
          closing={{ overlay: <ClosingOverlay />, section: <ClosingSection /> }}
        />

        <div id="conteudo">
          <S110Section />
        </div>

        <SolutionsSection />
        <DifferentiatorsSection />
        <BrandsAndAreaSection />
        <ContactSection />
      </main>
      <Footer />
    </>
  );
}

export default App;
