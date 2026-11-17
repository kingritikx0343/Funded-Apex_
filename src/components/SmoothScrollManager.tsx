import React, { useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';

/**
 * 120FPS Native Hardware-Composited Scroll & Resilient Section Reveal Manager
 * - Leaves wheel/touch scrolling 100% on the browser's dedicated 120Hz GPU compositor thread.
 * - Uses IntersectionObserver + MutationObserver + passive scroll + safety sweep so
 *   dynamically mounted routes (FAQ, Affiliate, Challenges, Legal, Home sections) ALWAYS
 *   animate smoothly and NEVER get stuck invisible/blank.
 */
export const SmoothScrollManager: React.FC = () => {
  const { route } = usePlatform();
  const isTerminal = route === 'terminal';

  useEffect(() => {
    if (isTerminal || typeof window === 'undefined') {
      return;
    }

    const selector = [
      '.apex-reveal-init',
      '.apex-scroll-unit',
      '[data-reveal]',
      '[data-scroll-reveal]',
      'main > section',
      'main > div > section',
    ].join(', ');

    const revealElement = (el: HTMLElement) => {
      el.classList.remove('apex-scroll-pending');
      el.classList.add('is-revealed');
    };

    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.isIntersecting) {
                  const target = entry.target as HTMLElement;
                  revealElement(target);
                  observer?.unobserve(target);
                }
              }
            },
            {
              root: null,
              rootMargin: '120px 0px 80px 0px',
              threshold: 0.01,
            }
          )
        : null;

    const bindTargets = () => {
      const nodes = document.querySelectorAll<HTMLElement>(selector);
      const viewportH = window.innerHeight || 900;

      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!el.classList.contains('apex-scroll-animated')) {
          el.classList.add('apex-scroll-animated');
        }

        if (el.classList.contains('is-revealed')) continue;

        const rect = el.getBoundingClientRect();
        // Immediately reveal if on-screen, above viewport, or short subpage
        if (rect.top < viewportH * 1.05 || route !== 'home') {
          revealElement(el);
          observer?.unobserve(el);
        } else if (el.dataset.apexScrollBound !== '1') {
          el.dataset.apexScrollBound = '1';
          if (observer) {
            el.classList.add('apex-scroll-pending');
            observer.observe(el);
          } else {
            revealElement(el);
          }
        }
      }
    };

    const revealVisiblePending = () => {
      const pending = document.querySelectorAll<HTMLElement>('.apex-scroll-pending');
      if (pending.length === 0) return;
      const viewportH = window.innerHeight || 900;
      for (let i = 0; i < pending.length; i++) {
        const el = pending[i];
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportH * 1.08) {
          revealElement(el);
          observer?.unobserve(el);
        }
      }
    };

    let rafId = window.requestAnimationFrame(() => {
      bindTargets();
      revealVisiblePending();
    });

    // Re-bind whenever new route trees or sections mount
    let mutRafId = 0;
    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            if (mutRafId) return;
            mutRafId = window.requestAnimationFrame(() => {
              mutRafId = 0;
              bindTargets();
              revealVisiblePending();
            });
          })
        : null;

    if (mutationObserver && document.body) {
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    const onScroll = () => {
      revealVisiblePending();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Safety sweep after mount so no element ever stays pending
    const safetyTimer = window.setTimeout(() => {
      bindTargets();
      revealVisiblePending();
    }, 260);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (mutRafId) window.cancelAnimationFrame(mutRafId);
      window.clearTimeout(safetyTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [isTerminal, route]);

  return null;
};
