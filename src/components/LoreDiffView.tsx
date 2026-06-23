import React, { useMemo } from 'react';
import * as Diff2Html from 'diff2html';
import * as Diff2HtmlTypes from 'diff2html/lib/types';
import 'diff2html/bundles/css/diff2html.min.css';

interface LoreDiffViewProps {
  /** Renderer-ready unified diff text (from LoreClient.diffText / normalizeLoreDiffForRenderer). */
  diff: string;
  /** 'side-by-side' or 'line-by-line'. */
  outputFormat?: 'side-by-side' | 'line-by-line';
}

/**
 * Renders a unified diff via diff2html — the same renderer the git DiffViewer uses, so Lore
 * diffs look consistent. Lore's CLI emits `--- <path>@<rev>` headers; LoreClient.diffText()
 * already normalizes those to `a/ b/` form that diff2html understands.
 */
function LoreDiffView({ diff, outputFormat = 'line-by-line' }: LoreDiffViewProps) {
  const html = useMemo(() => {
    if (!diff.trim()) return '';
    return Diff2Html.html(diff, {
      drawFileList: false,
      outputFormat,
      matching: 'lines',
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
      colorScheme: Diff2HtmlTypes.ColorSchemeType.AUTO,
    });
  }, [diff, outputFormat]);

  if (!diff.trim()) {
    return <div style={{ color: '#777', fontSize: 12, padding: 8 }}>(no textual diff — new or binary file)</div>;
  }

  return <div className="diff2html-container" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default LoreDiffView;
