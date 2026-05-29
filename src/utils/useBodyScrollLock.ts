import { useEffect } from "react";

/** Impede rolagem da página atrás de modais (evita dupla barra de scroll). */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    html.classList.add("modal-open");
    if (scrollbar > 0) {
      body.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
      body.style.paddingRight = prevPaddingRight;
      html.classList.remove("modal-open");
    };
  }, [locked]);
}
