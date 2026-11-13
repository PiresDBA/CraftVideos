function writeSceneASS(cfg, dir, lang, sceneId, text, seconds, bandH, onLight, opts) {
  const folder = path.join(dir, 'subtitles', String(lang || 'pt-BR'));
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'scene-' + sceneId + '.ass');
  const clean = String(text || '').replace(/\r?\n/g, ' ').replace(/[{}]/g, '').trim();
  const SUB = cfg.cards.subtitle || {};
  const TS = cfg.cards.textStyle || {};
  const total = Math.max(0.5, seconds);
  const events = [];

  // ---- the big phrase: one text layer over the whole frame, presenter included. A card
  // cannot paint outside its own band, which is why this had to move to the ASS layer.
  const phrase = opts && opts.phrase;
  if (TS.mode === 'caption' && phrase) {
    const LM = layoutMetrics(cfg);
    // anchorY is the BOTTOM edge of the headline, as a fraction of frame height, for each placement.
    const hasTopMedia = !!opts.hasTopMedia;
    const anchorY = Math.max(0.12, Math.min(0.95,
      Number(hasTopMedia ? opts.topBandRatio * 0.80 : 0.28)
    ));
    const rawSource = String(phrase).replace(/\r?\n/g, ' ').trim();
    const raw = String(TS.captionWords || '').toLowerCase() === 'keywords'
      ? keyWords(rawSource, TS.maxCaptionWords || 4).join(' ')
      : rawSource;
    const uw = TS.uppercase !== false ? raw.toUpperCase() : raw;
    const runs = highlightRuns(uw, TS);
    const accent = (TS.highlight && TS.highlight.color) || (TS.onMedia && TS.onMedia.accent) || '#FF6A00';
    const y = Math.round(LM.H * anchorY);
    // NB: the Format has TEN fields (…,MarginV,Effect,Text). The empty Effect field is the
    // `,,` after the three margin zeros — drop one comma and libass puts the override
    // block in Effect and prints it literally as text ("1075)UMA LISTA NAO AGE").
    events.push(
      'Dialogue: 1,0:00:00.00,' + assTime(total) + ',Head,,0,0,0,,' +
      '{\\an2\\pos(' + Math.round(LM.W / 2) + ',' + y + ')}' + accentRuns(runs, accent)
    );
  }