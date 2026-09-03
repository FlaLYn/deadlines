import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { ExtractResult } from '../../shared/types';

/**
 * Shows the imported syllabus as it actually looks, beside the extracted items.
 *
 * Source highlighting is currently switched off. The extraction still records a
 * `sourceQuote` per assignment and `sourceMatch.ts` still locates those quotes, so
 * turning it back on is a rendering change rather than a rebuild — see the README.
 */

/** Strips anything executable from mammoth's HTML before it goes into the DOM. */
function sanitize(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      const isUnsafeHref =
        (name === 'href' || name === 'src') && !/^(https?:|data:image\/|#|mailto:)/.test(value);
      if (name.startsWith('on') || isUnsafeHref) element.removeAttribute(attribute.name);
    }
  });
  return parsed.body.innerHTML;
}

export default function SourceDocument({ result }: { result: ExtractResult }) {
  const mode: 'pdf' | 'html' | 'text' =
    result.extension === '.pdf' ? 'pdf' : result.documentHtml ? 'html' : 'text';

  const contentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(mode === 'pdf');
  const [failure, setFailure] = useState('');

  const html = useMemo(
    () => (mode === 'html' ? sanitize(result.documentHtml) : ''),
    [mode, result.documentHtml],
  );

  // Canvas for appearance, plus pdf.js's TextLayer — invisible spans aligned to each
  // glyph run, which is what makes the rendered page selectable and copyable.
  useEffect(() => {
    if (mode !== 'pdf') return;
    let cancelled = false;

    void (async () => {
      try {
        const file = await window.deadlines.syllabus.read(result.filePath);
        if (!file.ok) throw new Error(file.error);
        const bytes = Uint8Array.from(atob(file.data.base64), (character) => character.charCodeAt(0));

        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        const host = contentRef.current;
        if (!host) return;
        host.replaceChildren();
        const width = host.clientWidth || 640;

        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: width / base.width });

          const wrapper = document.createElement('div');
          wrapper.className = 'pdf-page';
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;

          const canvas = document.createElement('canvas');
          const ratio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          wrapper.appendChild(canvas);

          const layer = document.createElement('div');
          layer.className = 'textLayer';
          wrapper.appendChild(layer);
          host.appendChild(wrapper);

          const context = canvas.getContext('2d');
          if (context) {
            context.scale(ratio, ratio);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
          }
          const textLayer = new pdfjs.TextLayer({
            textContentSource: await page.getTextContent(),
            container: layer,
            viewport,
          });
          await textLayer.render();
        }

        if (cancelled) return;
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setFailure(error instanceof Error ? error.message : 'This PDF could not be displayed.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, result.filePath]);

  if (failure) {
    return (
      <div className="source-empty">
        <FileText size={22} />
        <b>Couldn’t display this file</b>
        <span>{failure}</span>
      </div>
    );
  }

  if (mode === 'text' && !result.documentText) {
    return (
      <div className="source-empty">
        <FileText size={22} />
        <b>Nothing to preview for this file</b>
        <span>
          Gemini read the document directly, but this format has no text the app can
          display. A scanned PDF usually needs OCR first.
        </span>
      </div>
    );
  }

  return (
    <div className="source-body">
      {loading && (
        <div className="source-loading">
          <Loader2 size={18} className="spin" /> Opening the document…
        </div>
      )}

      {/* For PDFs, pdf.js appends the page elements into this host imperatively. */}
      <div className={`source-content source-${mode}`} ref={contentRef}>
        {mode === 'html' && (
          // Sanitised above: scripts, styles, handlers and non-http hrefs removed.
          <div className="docx-page" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {mode === 'text' && result.documentText}
      </div>
    </div>
  );
}
