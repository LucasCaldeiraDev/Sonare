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
import { ZoomParallax } from "./components/ZoomParallax";

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

        {/* The film hands straight over to the house's own imagery, which
            converges on the S110: the zoom ends with the display full-bleed
            and names it, so the written spotlight below opens on a subject
            the visitor has just been shown rather than introduced cold. */}
        <ZoomParallax />

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
