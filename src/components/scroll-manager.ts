import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SceneAPI } from './scene';

gsap.registerPlugin(ScrollTrigger);

export function initScrollManager(sceneAPI: SceneAPI) {
  // Lenis smooth scroll — synced to GSAP ticker, no own rAF
  const lenis = new Lenis({ autoRaf: false });

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // Master scroll trigger on the spacer
  ScrollTrigger.create({
    trigger: '#scroll-spacer',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5,
    onUpdate(self) {
      sceneAPI.setProgress(self.progress);
      sceneAPI.render();
    },
  });

  // Per-section text reveal animations
  const reveals = gsap.utils.toArray<HTMLElement>('.reveal-text');
  reveals.forEach((el) => {
    gsap.fromTo(el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          end: 'top 50%',
          scrub: 0.3,
        },
      }
    );
  });

  // Sticky section fade-out
  const stickyFaders = gsap.utils.toArray<HTMLElement>('.sticky-fade');
  stickyFaders.forEach((el) => {
    gsap.to(el, {
      opacity: 0,
      scrollTrigger: {
        trigger: el.closest('.scroll-section') || el,
        start: 'bottom 60%',
        end: 'bottom 20%',
        scrub: true,
      },
    });
  });

  return {
    destroy() {
      lenis.destroy();
      ScrollTrigger.getAll().forEach(st => st.kill());
    },
  };
}
