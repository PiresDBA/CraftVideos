#!/usr/bin/env node
/**
 * Enhanced YT Dashboard - Working Independent Filters
 * 
 * Each filter works independently and refreshes the screen
 */

import fs from 'fs';
import path from 'path';

const CONFIG = {
  outDir: path.join('D:', 'CRAFT', 'work', 'research', 'dashboard'),
  dataFile: path.join('D:', 'CRAFT', 'work', 'research', 'run1', 'channels.json'),
  enrichedDataFile: path.join('D:', 'CRAFT', 'work', 'research', 'dashboard', 'data.json'),
};

function isShortVideo(duration, title) {
  const d = Number(duration || 0);
  if (d > 0) return d <= 180;
  return /#shorts?\b/i.test(String(title || ''));
}

function loadDashboardData() {
  // Prefer enriched merged dataset (many videos per category)
  if (fs.existsSync(CONFIG.enrichedDataFile)) {
    const data = JSON.parse(fs.readFileSync(CONFIG.enrichedDataFile, 'utf8'));
    const videos = Array.isArray(data.videos) ? data.videos.slice().map(v => ({
      ...v,
      isShort: isShortVideo(v.duration, v.title),
      contentType: isShortVideo(v.duration, v.title) ? 'shorts' : 'long',
    })).sort((a,b)=>(b.views||0)-(a.views||0)) : [];
    if (videos.length) {
      return { mode: 'videos', videos, meta: data, label: 'Vídeos' };
    }
  }
  // Fallback: old channel-based data
  const channelsData = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
  const channels = (channelsData.channels || []).slice();
  // Convert channels to pseudo-video items for unified rendering
  const videos = channels.map(ch => {
    const tv = ch.topVideo || {};
    const category = (tv.categories && tv.categories[0]) || (ch.categories && ch.categories[0]) || 'Sem categoria';
    const key = String(category).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'') || 'semcategoria';
    const duration = Number(tv.duration || 0);
    const isShort = isShortVideo(duration, tv.title || '');
    const views = Number(tv.views || 0);
    return {
      id: tv.id || '',
      title: tv.title || ch.channel || 'Sem vídeo',
      channel: ch.channel || '',
      channel_id: ch.channel_id || tv.channel_id || '',
      channel_url: ch.channel_url || '',
      views,
      viewsLabel: views.toLocaleString('pt-BR'),
      duration,
      isShort,
      contentType: isShort ? 'shorts' : 'long',
      category,
      categoryKey: key,
      audience: /(criança|infantil|kids|children|baby|nursery)/i.test((ch.channel||'')+' '+(tv.title||'')) ? 'kids' : (/(aula|curso|tutorial|educa|learn|aprenda)/i.test((ch.channel||'')+' '+(tv.title||'')) ? 'educational' : 'general'),
      url: tv.url || (tv.id ? `https://www.youtube.com/watch?v=${tv.id}` : '#'),
      thumbnail: tv.id ? `https://i.ytimg.com/vi/${tv.id}/mqdefault.jpg` : '',
      _channel: ch,
    };
  }).filter(v => v.id).sort((a,b)=>b.views-a.views);
  return { mode: 'channels', videos, channels, meta: channelsData, label: 'Canais' };
}

function escapeHtml(text) {
  if (!text) return text;
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

class ReferenceVideoManager {
  constructor() {
    this.references = new Map();
  }

  parseYouTubeUrl(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  async analyzeVideo(videoId) {
    return {
      id: videoId,
      title: 'Video ' + videoId + ' - Analyzed Content',
      keyMoments: [
        { time: '0:15', description: 'Introduction and setup', sentiment: 'positive' },
        { time: '1:30', description: 'Main topic demonstration', sentiment: 'neutral' },
        { time: '3:00', description: 'Key insights and takeaways', sentiment: 'positive' },
      ],
      topics: ['Topic 1', 'Topic 2', 'Topic 3'],
      sentiment: 'positive',
    };
  }

  extractIdeas(analysis) {
    return analysis.keyMoments.map((moment, index) => ({
      id: 'idea_' + Date.now() + '_' + index,
      text: moment.description + ' (' + moment.time + ')',
      relevance: 0.8 + (Math.random() * 0.2),
      sentiment: moment.sentiment,
    }));
  }

  generateScript(ideas, analysis) {
    const intro = 'Introduction to ' + analysis.title + '\nBased on key insights from video analysis.';
    const mainSections = ideas.slice(0, 3).map(idea => 
      'Section: ' + idea.text + '\nKey insights: ' + idea.sentiment + ' sentiment with high relevance.'
    ).join('\n\n');
    const outro = '\nConclusion\nSummary of key takeaways and next steps.';
    return intro + '\n\n' + mainSections + outro;
  }

  async addReference(url) {
    const videoId = this.parseYouTubeUrl(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const referenceId = 'ref_' + Date.now();
    const analysis = await this.analyzeVideo(videoId);
    const ideas = this.extractIdeas(analysis);
    const script = this.generateScript(ideas, analysis);

    this.references.set(referenceId, {
      id: referenceId,
      url: 'https://www.youtube.com/watch?v=' + videoId,
      videoId,
      title: analysis.title,
      addedAt: new Date().toISOString(),
      status: 'processed',
      ideas,
      script,
    });

    return referenceId;
  }

  getReference(id) {
    return this.references.get(id);
  }

  getAllReferences() {
    return Array.from(this.references.values());
  }
}

class CloneManager {
  constructor(referenceManager) {
    this.referenceManager = referenceManager;
    this.clones = [];
  }

  createClone(name, sourceVideoId = null, referenceId = null) {
    const reference = referenceId ? this.referenceManager.getReference(referenceId) : null;
    
    let script = '';
    if (reference) {
      script = 'Clone script for ' + name + '\n' +
        'Based on reference video: ' + reference.title + '\n' +
        'Key ideas from reference: ' + reference.ideas.map(i => i.text).join(', ') + '\n' +
        'Generated script: ' + reference.script;
    } else {
      script = 'Clone script for ' + name + '\n' +
        'Based on source video: ' + sourceVideoId + '\n' +
        'Instructions: Follow original structure and maintain key elements.';
    }

    const clone = {
      id: 'clone_' + Date.now(),
      name,
      sourceVideo: sourceVideoId,
      referenceVideo: referenceId,
      createdAt: new Date().toISOString(),
      status: 'completed',
      script,
      warnings: reference ? [] : ['Using source video only - may need additional reference for better results'],
    };

    this.clones.push(clone);
    return clone;
  }
}

function generateHTML(videos, referenceManager, cloneManager, dataInfo = {}) {
  const items = Array.isArray(videos) ? videos.slice() : [];
  const references = referenceManager.getAllReferences();
  const recentClones = cloneManager.clones.slice(-5);

  // Get unique categories from videos
  const categories = {};
  let shortsCount = 0;
  let longCount = 0;
  for (let v of items) {
    const catKey = v.categoryKey || String(v.category || 'Sem categoria').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'') || 'semcategoria';
    const catLabel = v.category || 'Sem categoria';
    if (!categories[catKey]) {
      categories[catKey] = { label: catLabel, count: 0, shorts: 0 };
    }
    categories[catKey].count++;
    const isShort = isShortVideo(v.duration, v.title);
    v.isShort = isShort;
    v.contentType = isShort ? 'shorts' : 'long';
    if (isShort) { shortsCount++; categories[catKey].shorts++; } else { longCount++; }
  }

  // Sort categories by count desc
  const sortedEntries = Object.entries(categories).sort((a,b)=>b[1].count-a[1].count);
  const sortedCategories = Object.fromEntries(sortedEntries);

  // Count audience types
  let kidsCount = 0;
  let educationalCount = 0;
  let generalCount = 0;
  for (let v of items) {
    const aud = v.audience || 'general';
    if (aud === 'kids') kidsCount++;
    else if (aud === 'educational') educationalCount++;
    else generalCount++;
  }

  // Sort videos by views (most ranqueados primeiro)
  items.sort((a, b) => (Number(b.views||0) - Number(a.views||0)));

  // For template compatibility
  const channels = items;
  const dataMeta = dataInfo || {};
  const generatedAt = (dataMeta.meta && dataMeta.meta.generatedAt) || new Date().toISOString();
  const sourceCount = (dataMeta.meta && dataMeta.meta.sources && dataMeta.meta.sources.length) || (dataMeta.sources && dataMeta.sources.length) || 0;

  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ArtCraft YT Dashboard - Top Vídeos por Categoria</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f7fa;
      color: #333;
      min-height: 100vh;
    }
    .container {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    
    /* Left Sidebar - Filters */
    .sidebar {
      width: 300px;
      background: #ffffff;
      border-right: 1px solid #e1e5e9;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      box-shadow: 2px 0 10px rgba(0,0,0,0.05);
    }
    .sidebar-header {
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .sidebar-header h1 {
      font-size: 1.3em;
      margin-bottom: 5px;
    }
    .sidebar-header p {
      font-size: 0.85em;
      opacity: 0.9;
    }
    .sidebar-section {
      padding: 16px;
      border-bottom: 1px solid #f1f3f5;
    }
    .sidebar-section h3 {
      font-size: 0.95em;
      color: #495057;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #667eea;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .filter-group {
      margin-bottom: 12px;
    }
    .filter-group label {
      display: block;
      font-weight: 600;
      font-size: 0.8em;
      color: #6c757d;
      margin-bottom: 6px;
    }
    .filter-btn {
      display: block;
      width: 100%;
      padding: 9px 12px;
      margin: 3px 0;
      text-align: left;
      border: 1px solid #e1e5e9;
      background: #ffffff;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.85em;
      color: #495057;
    }
    .filter-btn:hover {
      border-color: #667eea;
      background: #f0f4ff;
      color: #667eea;
    }
    .filter-btn.active {
      background: #667eea;
      border-color: #667eea;
      color: white;
    }
    .filter-btn.active.short {
      background: #28a745;
      border-color: #28a745;
    }
    .filter-btn.active.long {
      background: #17a2b8;
      border-color: #17a2b8;
    }
    .filter-btn.active.kids {
      background: #e83e8c;
      border-color: #e83e8c;
    }
    .filter-btn.active.educational {
      background: #6f42c1;
      border-color: #6f42c1;
    }
    .filter-count {
      float: right;
      background: rgba(255,255,255,0.2);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.75em;
    }

    /* Main Content */
    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 25px;
      position: relative;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
    }
    .top-bar h2 {
      font-size: 1.5em;
      color: #333;
    }
    .top-bar .stats {
      display: flex;
      gap: 15px;
    }
    .stat-box {
      background: white;
      padding: 12px 18px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      min-width: 90px;
      text-align: center;
    }
    .stat-box .stat-value {
      font-size: 1.6em;
      font-weight: 700;
      color: #667eea;
      display: block;
    }
    .stat-box .stat-label {
      font-size: 0.8em;
      color: #6c757d;
      text-transform: uppercase;
      margin-top: 3px;
    }
    .refresh-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 11px 22px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }
    .refresh-btn:hover {
      background: #5a67d8;
    }

    /* Reference Video */
    .reference-banner {
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 25px;
      display: none;
    }
    .reference-banner.show {
      display: block;
    }
    .reference-banner h3 {
      color: #856404;
      margin-bottom: 6px;
      font-size: 1.1em;
    }
    .reference-banner p {
      color: #856404;
      margin-bottom: 4px;
      font-size: 0.85em;
    }
    .reference-actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .reference-actions button {
      background: #ffc107;
      border: none;
      color: #856404;
      padding: 7px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      margin-right: 8px;
      font-size: 0.85em;
    }
    .reference-actions button:hover {
      background: #e0a800;
    }
    
    /* Reference Preview Card */
    .reference-preview-card {
      background: #ffffff;
      border: 2px solid #ffc107;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 25px;
      display: none;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    }
    .reference-preview-card.show {
      display: block;
    }
    .reference-preview-card h3 {
      color: #856404;
      font-size: 1.1em;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .reference-preview-card .ref-thumbnail {
      width: 100%;
      height: 150px;
      background: #000;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .reference-preview-card .ref-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .reference-preview-card .ref-play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .reference-preview-card .ref-play-btn {
      width: 70px;
      height: 70px;
      background: #ff0000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 15px rgba(0,0,0,0.5);
    }
    .reference-preview-card .ref-play-btn::before {
      content: '';
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 22px solid white;
      border-top: 13px solid transparent;
      border-bottom: 13px solid transparent;
      margin-left: 4px;
    }
    .reference-preview-card .ref-info {
      margin-bottom: 12px;
    }
    .reference-preview-card .ref-info p {
      color: #6c757d;
      font-size: 0.85em;
      margin-bottom: 4px;
    }
    .reference-preview-card .ref-info strong {
      color: #333;
    }
    .reference-preview-card .ref-actions {
      display: flex;
      gap: 8px;
    }
    .reference-preview-card .ref-actions button {
      flex: 1;
      padding: 10px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85em;
    }
    .reference-preview-card .ref-actions .btn-watch {
      background: #ff0000;
      color: white;
    }
    .reference-preview-card .ref-actions .btn-watch:hover {
      background: #cc0000;
    }
    .reference-preview-card .ref-actions .btn-clone-from-ref {
      background: #6f42c1;
      color: white;
    }
    .reference-preview-card .ref-actions .btn-clone-from-ref:hover {
      background: #5a3a99;
    }
    .reference-preview-card .ref-actions .btn-remove {
      background: #dc3545;
      color: white;
    }
    .reference-preview-card .ref-actions .btn-remove:hover {
      background: #c82333;
    }

    /* Channel Grid */
    .channels-title {
      font-size: 1.3em;
      color: #333;
      margin-bottom: 18px;
    }
    .channel-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .channel-card {
      background: white;
      border-radius: 10px;
      border: 1px solid #e1e5e9;
      overflow: hidden;
      transition: all 0.3s;
      cursor: pointer;
    }
    .channel-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 15px 35px rgba(0,0,0,0.12);
      border-color: #667eea;
    }
    .channel-card .video-preview {
      position: relative;
      width: 100%;
      height: 160px;
      background: #000;
      overflow: hidden;
    }
    .channel-card .video-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .channel-card .hover-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.3s;
    }
    .channel-card:hover .hover-overlay {
      opacity: 0;
    }
    .channel-card .play-btn {
      width: 60px;
      height: 60px;
      background: #ff0000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 15px rgba(0,0,0,0.5);
      transform: scale(1);
      transition: transform 0.3s;
    }
    .channel-card:hover .play-btn {
      transform: scale(1.1);
    }
    .channel-card .play-btn::before {
      content: '';
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 22px solid white;
      border-top: 13px solid transparent;
      border-bottom: 13px solid transparent;
      margin-left: 4px;
    }
    .channel-card .shorts-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      background: #ff0000;
      color: white;
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 0.7em;
      font-weight: 700;
      z-index: 3;
    }
    .channel-card .card-body {
      padding: 16px;
    }
    .channel-card .category-tag {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.75em;
      margin-bottom: 10px;
    }
    .channel-card .card-title {
      font-size: 1em;
      font-weight: 700;
      color: #333;
      margin: 0 0 10px 0;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .channel-card .card-stats {
      display: flex;
      gap: 12px;
      font-size: 0.8em;
      color: #6c757d;
      margin-bottom: 12px;
    }
    .channel-card .card-stats .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .channel-card .view-on-youtube {
      display: inline-block;
      background: #ff0000;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.8em;
      font-weight: 600;
    }
    .channel-card .view-on-youtube:hover {
      background: #cc0000;
    }
    .channel-card .clone-btn-card {
      display: inline-block;
      background: #6f42c1;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.8em;
      font-weight: 600;
      margin-top: 8px;
      border: none;
      cursor: pointer;
    }
    .channel-card .clone-btn-card:hover {
      background: #5a3a99;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 40px;
      color: #6c757d;
      display: none;
    }
    .empty-state.show {
      display: block;
    }
    .empty-state h3 {
      font-size: 1.4em;
      margin-bottom: 8px;
      color: #495057;
    }

    /* Video Modal */
    .video-modal {
      position: fixed;
      inset: 0;
      z-index: 2000;
      background: rgba(0,0,0,0.92);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }
    .video-modal.show {
      display: flex;
    }
    .video-modal .modal-content {
      background: #1a1a1a;
      border-radius: 16px;
      max-width: 1000px;
      width: 100%;
      max-height: 85vh;
      overflow: hidden;
      position: relative;
      box-shadow: 0 30px 100px rgba(0,0,0,0.5);
    }
    .video-modal .modal-header {
      padding: 20px 30px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .video-modal .modal-title {
      color: white;
      font-size: 1.4em;
      margin: 0;
    }
    .video-modal .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 2em;
      cursor: pointer;
      padding: 5px;
    }
    .video-modal .video-player {
      padding: 0;
      background: #000;
      height: 500px;
    }
    .video-modal .video-info {
      padding: 25px;
      color: white;
    }
    .video-modal .video-info h3 {
      margin: 0 0 12px 0;
      color: #667eea;
      font-size: 1.4em;
    }
    .video-modal .video-info p {
      margin: 6px 0;
      color: #aaa;
      font-size: 0.95em;
    }
    .video-modal .video-actions {
      padding: 25px;
      border-top: 1px solid #333;
      display: flex;
      gap: 12px;
    }
    .video-modal .btn-clone {
      background: #ff0000;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      flex: 1;
      font-size: 0.95em;
    }
    .video-modal .btn-clone:hover {
      background: #cc0000;
    }
    .video-modal .btn-close-modal {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      flex: 1;
    }
    .video-modal .btn-close-modal:hover {
      background: #555;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #28a745;
      color: white;
      padding: 14px 22px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transform: translateY(100px);
      transition: transform 0.3s ease;
      z-index: 3000;
    }
    .toast.show {
      transform: translateY(0);
    }

    /* Clone Section */
    .clone-section {
      background: white;
      border-radius: 12px;
      padding: 22px;
      margin-top: 35px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
    }
    .clone-section h2 {
      font-size: 1.3em;
      color: #333;
      margin-bottom: 18px;
    }
    .clone-form {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .clone-form input {
      flex: 1;
      min-width: 180px;
      padding: 11px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 0.9em;
    }
    .clone-form select {
      flex: 1;
      min-width: 140px;
      padding: 11px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 0.9em;
    }
    .clone-form button {
      padding: 11px 22px;
      background: #6f42c1;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    .clone-form button:hover {
      background: #5a3a99;
    }
    #cloneStatus {
      margin-top: 16px;
    }

    /* ---- Telemetria: painel de "mission control" ---- */
    .tm {
      background: linear-gradient(180deg, #101826 0%, #0b1220 100%);
      color: #dbe4f0;
      border: 1px solid #1f2b3d;
      border-radius: 16px;
      box-shadow: 0 18px 48px rgba(8, 15, 28, .28), inset 0 1px 0 rgba(255,255,255,.04);
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .tm-head {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 16px 20px;
      background: rgba(255,255,255,.025);
      border-bottom: 1px solid #1f2b3d;
    }
    .tm-title { font-size: 14px; font-weight: 700; letter-spacing: .3px; color: #f1f5f9; display: flex; align-items: center; gap: 9px; }
    .tm-title .dot { width: 8px; height: 8px; border-radius: 50%; background: #64748b; flex: none; }
    .tm-title .dot.run { background: #38bdf8; box-shadow: 0 0 0 0 rgba(56,189,248,.7); animation: tmPulse 1.8s infinite; }
    .tm-title .dot.ok  { background: #34d399; }
    .tm-title .dot.err { background: #f87171; }
    @keyframes tmPulse { 70% { box-shadow: 0 0 0 9px rgba(56,189,248,0); } 100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); } }
    .tm-pill {
      font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase;
      padding: 5px 11px; border-radius: 999px; border: 1px solid #2b3a52; color: #94a3b8; background: #131d2e;
      white-space: nowrap;
    }
    .tm-pill.run { color: #7dd3fc; border-color: #1d4ed8; background: rgba(37,99,235,.16); }
    .tm-pill.ok  { color: #6ee7b7; border-color: #15803d; background: rgba(21,128,61,.18); }
    .tm-pill.err { color: #fca5a5; border-color: #b91c1c; background: rgba(185,28,28,.20); }
    .tm-pill.ghost { color: #64748b; }
    .tm-spacer { flex: 1 1 auto; }

    .tm-bar-wrap { padding: 16px 20px 6px; }
    .tm-bar {
      position: relative; height: 9px; border-radius: 999px;
      background: #16213a; overflow: hidden; border: 1px solid #22304a;
    }
    .tm-bar > i {
      display: block; height: 100%; width: 0%;
      background: linear-gradient(90deg, #2563eb 0%, #38bdf8 55%, #34d399 100%);
      border-radius: 999px; transition: width .6s cubic-bezier(.4,0,.2,1);
      box-shadow: 0 0 14px rgba(56,189,248,.55);
    }
    .tm-bar.indet > i { width: 34% !important; animation: tmSlide 1.6s ease-in-out infinite; }
    @keyframes tmSlide { 0% { transform: translateX(-110%); } 100% { transform: translateX(330%); } }
    .tm-bar.err > i { background: linear-gradient(90deg,#b91c1c,#f87171); box-shadow:none; }
    .tm-bar.ok  > i { background: linear-gradient(90deg,#15803d,#34d399); box-shadow:none; }
    .tm-bar-meta { display:flex; justify-content:space-between; gap:10px; margin-top:9px; font-size:12px; color:#93a4bd; flex-wrap:wrap; }
    .tm-bar-meta b { color:#e2e8f0; font-weight:600; }

    .tm-steps { display:flex; gap:6px; flex-wrap:wrap; padding: 12px 20px 16px; }
    .tm-step-pill {
      display:flex; align-items:center; gap:6px;
      font-size:11px; font-weight:600; letter-spacing:.2px;
      padding:6px 11px; border-radius:999px;
      border:1px solid #23304a; background:#121c2e; color:#64748b; white-space:nowrap;
    }
    .tm-step-pill .s { width:7px; height:7px; border-radius:50%; background:#334155; flex:none; }
    .tm-step-pill.done { color:#a7f3d0; border-color:#14532d; background:rgba(20,83,45,.35); }
    .tm-step-pill.done .s { background:#34d399; }
    .tm-step-pill.active {
      color:#e0f2fe; border-color:#2563eb; background:rgba(37,99,235,.24);
      box-shadow:0 0 0 3px rgba(37,99,235,.12);
    }
    .tm-step-pill.active .s { background:#38bdf8; box-shadow:0 0 8px #38bdf8; }

    .tm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:1px; background:#1f2b3d; border-top:1px solid #1f2b3d; border-bottom:1px solid #1f2b3d; }
    .tm-cell { background:#0d1524; padding:14px 20px; }
    .tm-cell .k { font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:#64748b; margin-bottom:7px; font-weight:700; }
    .tm-cell .v { font-size:14px; color:#f1f5f9; font-weight:600; line-height:1.4; word-break:break-word; }
    .tm-cell .v small { display:block; font-size:11px; color:#7f8ea6; font-weight:400; margin-top:5px; }

    .tm-section { padding: 14px 20px; border-bottom:1px solid #1f2b3d; }
    .tm-section:last-child { border-bottom:none; }
    .tm-section h4 {
      margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:1.2px;
      text-transform:uppercase; color:#64748b; display:flex; align-items:center; gap:8px;
    }
    .tm-section h4 .btn-mini {
      margin-left:auto; font-size:11px; font-weight:600; letter-spacing:0; text-transform:none;
      background:#18243a; border:1px solid #27354d; color:#9fb0c8; padding:4px 10px; border-radius:6px; cursor:pointer;
    }
    .tm-section h4 .btn-mini:hover { background:#1f2d47; color:#e2e8f0; }
    .tm-timeline { max-height:190px; overflow:auto; }
    .tm-tl-row { display:flex; gap:10px; padding:5px 0; font-size:12.5px; border-bottom:1px dashed #1c2739; color:#b6c4d6; }
    .tm-tl-row:last-child { border-bottom:none; }
    .tm-tl-row .t { color:#64748b; font-variant-numeric:tabular-nums; flex:none; }
    .tm-tl-row.now { color:#7dd3fc; font-weight:600; }
    .tm-log {
      background:#070c16; border:1px solid #1c2739; border-radius:9px; padding:12px 14px;
      font-family:'Cascadia Mono',Consolas,'Courier New',monospace; font-size:11.5px; line-height:1.65;
      white-space:pre-wrap; word-break:break-word; color:#a9b8cc; max-height:320px; overflow:auto;
    }
    .tm-log .err { color:#fca5a5; }
    .tm-log .ok  { color:#86efac; }
    .tm-art-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
    .tm-art { background:#0d1524; border:1px solid #1f2b3d; border-radius:9px; overflow:hidden; }
    .tm-art img, .tm-art video { width:100%; display:block; background:#05080f; max-height:190px; object-fit:cover; }
    .tm-art .cap { padding:7px 9px; font-size:11px; color:#93a4bd; display:flex; justify-content:space-between; gap:8px; }
    .tm-art .cap a { color:#7dd3fc; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tm-files { max-height:180px; overflow:auto; font-size:11.5px; }
    .tm-files a { color:#93c5fd; text-decoration:none; display:flex; gap:8px; padding:3px 0; }
    .tm-files a:hover { text-decoration:underline; }
    .tm-files .sz { margin-left:auto; color:#5b6b84; flex:none; }
    .tm-empty { color:#54637a; font-size:12px; font-style:italic; }
    .tm-actions { display:flex; gap:8px; flex-wrap:wrap; padding: 14px 20px; background:rgba(255,255,255,.02); }
    .tm-btn {
      background:#18243a; border:1px solid #27354d; color:#cbd5e1; padding:8px 13px;
      border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:.15s;
    }
    .tm-btn:hover { background:#1f2d47; border-color:#3b4d6b; color:#fff; }
    .tm-btn.primary { background:linear-gradient(180deg,#2563eb,#1d4ed8); border-color:#3b82f6; color:#fff; }
    .tm-btn.primary:hover { filter:brightness(1.12); }

    /* Recent Clones */
    .recent-section {
      background: white;
      border-radius: 12px;
      padding: 22px;
      margin-top: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
    }
    .recent-section h2 {
      font-size: 1.3em;
      color: #333;
      margin-bottom: 18px;
    }

    @media (max-width: 1200px) {
      .container {
        flex-direction: column;
        height: auto;
      }
      .sidebar {
        width: 100%;
        height: auto;
        max-height: 280px;
        overflow-y: auto;
      }
      .main-content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Left Sidebar with Filters -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>🎥 YT Dashboard</h1>
        <p>Filtros e Referência</p>
      </div>
      
      <div class="sidebar-section">
        <h3>📹 Vídeo de Referência</h3>
        <div class="filter-group">
          <input type="text" id="referenceUrl" placeholder="Cole URL do YouTube..." style="width:100%;padding:9px;border:1px solid #ddd;border-radius:5px;margin-bottom:6px;">
          <button class="filter-btn" onclick="addReferenceVideo()">Adicionar Referência</button>
        </div>
        <div id="referenceCurrent" class="reference-banner">
          <h3 id="refCurrentTitle"></h3>
          <p id="refCurrentUrl"></p>
          <div class="reference-actions">
            <button class="filter-btn" onclick="clearReferenceVideo()" style="background:#dc3545;border-color:#dc3545;color:white;font-size:0.85em;">Remover</button>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>📺 Tipo de Conteúdo</h3>
        <div class="filter-group">
          <button class="filter-btn active" data-filter-type="ctype" data-filter-value="all" onclick="setFilter('ctype','all',this)">Todos os vídeos</button>
          <button class="filter-btn" data-filter-type="ctype" data-filter-value="shorts" onclick="setFilter('ctype','shorts',this)">Só Shorts (até 1min)</button>
          <button class="filter-btn" data-filter-type="ctype" data-filter-value="long" onclick="setFilter('ctype','long',this)">Só Vídeos Longos</button>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>🏷️ Categoria</h3>
        <div class="filter-group">
          <button class="filter-btn active" data-filter-type="cat" data-filter-value="all" onclick="setFilter('cat','all',this)">Todas as categorias</button>
          ${generateCategoryButtons(sortedCategories)}
        </div>
      </div>

      <div class="sidebar-section">
        <h3>👥 Público</h3>
        <div class="filter-group">
          <button class="filter-btn active" data-filter-type="aud" data-filter-value="all" onclick="setFilter('aud','all',this)">Todos</button>
          <button class="filter-btn" data-filter-type="aud" data-filter-value="kids" onclick="setFilter('aud','kids',this)">Infantil (Crianças)</button>
          <button class="filter-btn" data-filter-type="aud" data-filter-value="educational" onclick="setFilter('aud','educational',this)">Aula / Educativo</button>
          <button class="filter-btn" data-filter-type="aud" data-filter-value="general" onclick="setFilter('aud','general',this)">Geral</button>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>📊 Estatísticas</h3>
        <div class="filter-group">
          <div style="background:#f8f9fa;padding:10px;border-radius:5px;margin-bottom:6px;">
            <div style="font-size:0.8em;color:#6c757d;">Shorts</div>
            <div style="font-size:1em;font-weight:700;color:#28a745;">` + shortsCount + `</div>
          </div>
          <div style="background:#f8f9fa;padding:10px;border-radius:5px;margin-bottom:6px;">
            <div style="font-size:0.8em;color:#6c757d;">Vídeos Longos</div>
            <div style="font-size:1em;font-weight:700;color:#17a2b8;">` + longCount + `</div>
          </div>
          <div style="background:#f8f9fa;padding:10px;border-radius:5px;">
            <div style="font-size:0.8em;color:#6c757d;">Total Vídeos</div>
            <div style="font-size:1em;font-weight:700;color:#667eea;">` + items.length + `</div>
          </div>
          <div style="background:#f8f9fa;padding:10px;border-radius:5px;margin-top:6px;">
            <div style="font-size:0.8em;color:#6c757d;">Categorias</div>
            <div style="font-size:1em;font-weight:700;color:#6f42c1;">` + Object.keys(sortedCategories).length + `</div>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>🔄 Buscar Mais Vídeos</h3>
        <div class="filter-group">
          <button id="collectBtn" class="filter-btn" onclick="startCollectTargets()" style="background:#28a745;border-color:#28a745;color:white;font-weight:700;">🔍 Buscar vídeos por categoria (Top 20 + Shorts)</button>
          <div id="collectStatus" style="margin-top:8px;font-size:0.85em;color:#495057;background:#f8f9fa;padding:10px;border-radius:6px;line-height:1.4;">Clique no botão para procurar mais vídeos em cada categoria. Pode demorar alguns minutos. Não feche esta página.</div>
          <div style="margin-top:8px;font-size:0.78em;color:#6c757d;">Dica: use o atalho do painel (servidor local). Se abriu o arquivo direto, inicie pelo <b>launch-dashboard.bat</b> atualizado.</div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <div class="top-bar">
        <h2 id="resultsTitle">📺 Top Vídeos por Categoria (ranked)</h2>
        <button class="refresh-btn" onclick="location.reload()">🔄 Atualizar Dados</button>
      </div>

      <!-- Reference Banner -->
      <div class="reference-banner" id="referenceBanner">
        <h3 id="bannerTitle"></h3>
        <p id="bannerUrl"></p>
        <div class="reference-actions">
          <button class="filter-btn" onclick="watchReferenceVideo()" style="background:#ff0000;border-color:#ff0000;color:white;font-size:0.85em;">▶ Assistir Vídeo</button>
          <button class="filter-btn" onclick="clearReferenceVideo()" style="background:#dc3545;border-color:#dc3545;color:white;font-size:0.85em;">Remover</button>
        </div>
      </div>

      <!-- Reference Preview Card -->
      <div class="reference-preview-card" id="referencePreviewCard">
        <h3>📹 Vídeo de Referência Selecionado</h3>
        <div class="ref-thumbnail" id="refThumbnail">
          <div class="ref-play-overlay" onclick="watchReferenceVideo()">
            <div class="ref-play-btn"></div>
          </div>
        </div>
        <div class="ref-info">
          <p><strong>Título:</strong> <span id="refPreviewTitle"></span></p>
          <p><strong>URL:</strong> <span id="refPreviewUrl"></span></p>
          <p><strong>Ideias:</strong> <span id="refPreviewIdeas"></span></p>
        </div>
        <div class="ref-actions">
          <button class="btn-watch" onclick="watchReferenceVideo()">▶ Assistir Vídeo</button>
          <button class="btn-clone-from-ref" onclick="cloneFromReference()">🎯 Clonar com Esta Referência</button>
          <button class="btn-remove" onclick="clearReferenceVideo()">✕ Remover</button>
        </div>
      </div>

      <div class="channels-title" id="channelsTitle">Vídeos (` + items.length + ` de ` + items.length + `)</div>
      <div class="channel-grid" id="channelGrid">
        ${generateChannelCards(items)}
      </div>

      <div class="empty-state" id="emptyState">
        <h3>Nenhum canal encontrado</h3>
        <p>Ajuste os filtros na barra esquerda para ver mais resultados</p>
      </div>

      <!-- Clone Section -->
      <div class="clone-section">
        <h2>🔄 Criar Clone de Vídeo (com telemetria em tempo real)</h2>
        <div class="clone-form">
          <input type="text" id="cloneName" placeholder="Nome do clone/projeto...">
          <select id="sourceVideo">
            <option value="">Selecionar vídeo base (opcional)...</option>
            ${generateChannelOptions(channels)}
          </select>
          <select id="referenceVideo">
            <option value="">Usar vídeo de referência (recomendado)...</option>
            ${generateReferenceOptions(references)}
          </select>
          <button onclick="createClone()">▶ Iniciar Clone (com telemetria)</button>
        </div>
        <div id="cloneStatus" style="margin-top:12px;">
          <div class="tm" id="telemetryPanel">
            <div class="tm-head">
              <div class="tm-title"><span class="dot" id="tmDot"></span><span id="tmTitle">Painel de telemetria</span></div>
              <span class="tm-pill ghost" id="tmStatus">AGUARDANDO</span>
              <span class="tm-pill ghost" id="tmJobId">sem job</span>
              <span class="tm-spacer"></span>
              <span class="tm-pill ghost" id="tmClock">00:00</span>
            </div>

            <div class="tm-bar-wrap">
              <div class="tm-bar" id="tmBar"><i></i></div>
              <div class="tm-bar-meta">
                <span id="tmPct">0%</span>
                <span>Decorrido <b id="tmElapsed">-</b> · Restante <b id="tmEta">-</b></span>
              </div>
            </div>

            <div class="tm-steps" id="tmSteps"></div>

            <div class="tm-grid">
              <div class="tm-cell">
                <div class="k">A fazer agora</div>
                <div class="v" id="tmCurrent">Nenhum clone iniciado</div>
              </div>
              <div class="tm-cell">
                <div class="k">Projeto</div>
                <div class="v" id="tmProject">-<small id="tmOutput">-</small></div>
              </div>
              <div class="tm-cell">
                <div class="k">Etapas executadas</div>
                <div class="v" id="tmStepCount">0</div>
              </div>
            </div>

            <div class="tm-section">
              <h4>Histórico de etapas <button class="btn-mini" onclick="toggleTmTimeline()">mostrar/ocultar</button></h4>
              <div class="tm-timeline" id="tmTimeline"></div>
            </div>

            <div class="tm-section">
              <h4>Log em tempo real <button class="btn-mini" onclick="toggleTmLog()">mostrar/ocultar</button><button class="btn-mini" onclick="copyTmLog()">copiar</button></h4>
              <div class="tm-log" id="tmLog">Aguardando início do clone…</div>
            </div>

            <div class="tm-section">
              <h4>Ficheiros gerados</h4>
              <div class="tm-art-grid" id="tmArtifacts"></div>
            </div>

            <div class="tm-actions">
              <button class="tm-btn primary" onclick="refreshCloneTelemetry()">🔄 Atualizar telemetria</button>
              <button class="tm-btn" onclick="openCloneOutputFolder()">📁 Pasta de saída</button>
              <button class="tm-btn" onclick="scrollToTelemetry()">⬆ Ver telemetria</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Clones -->
      <div class="recent-section">
        <h2>📋 Clones Recentes</h2>
        <div id="recentClones">
          ${generateRecentClones(recentClones)}
        </div>
      </div>
    </div>
  </div>

  <!-- Video Modal -->
  <div class="video-modal" id="videoModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title" id="modalVideoTitle">Vídeo</h3>
        <button class="close-btn" onclick="closeVideoModal()">&times;</button>
      </div>
      <div class="video-player" id="modalVideoPlayer">
        <iframe id="modalVideoIframe" width="100%" height="100%" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
      </div>
      <div class="video-info">
        <h3 id="modalVideoInfoTitle"></h3>
        <p id="modalVideoInfoViews"></p>
        <p id="modalVideoInfoCategory"></p>
        <p id="modalVideoHint" style="margin-top:10px;color:#f0ad4e;font-size:0.9em;">Se o player não carregar aqui (restrição do YouTube/propaganda), use "Abrir no YouTube".</p>
      </div>
      <div class="video-actions">
        <button class="btn-clone" onclick="cloneThisVideo()">🎯 Clonar Este Vídeo</button>
        <button class="btn-close-modal" id="btnOpenOnYouTube" onclick="openCurrentOnYouTube()">↗ Abrir no YouTube</button>
        <button class="btn-close-modal" onclick="closeVideoModal()">Fechar</button>
      </div>
    </div>
  </div>

  <script>
    // Global filter state - SIMPLE AND BULLETPROOF
    var filterState = { ctype: 'all', cat: 'all', aud: 'all' };
    var currentVideoId = '';
    var currentVideoTitle = '';
    var currentVideoViews = 0;
    var currentVideoCategory = '';
    var currentVideoIsShort = false;
    var currentVideoWatchUrl = '';
    var currentReferenceId = '';
    var currentReferenceTitle = '';
    var currentReferenceScript = '';

    function escapeHtml(text) {
      if (!text) return text;
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function showToast(message) {
      var toast = document.getElementById('toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 5000);
    }

    /* Filter Functions - BULLETPROOF */
    function setFilter(type, value, btn) {
      // Update filter state
      filterState[type] = value;
      
      // Deactivate ALL buttons in same group, then activate clicked one
      var allBtns = document.querySelectorAll('.filter-btn');
      allBtns.forEach(function(b) {
        var bType = b.getAttribute('data-filter-type');
        if (bType !== type) return; // Only buttons in same group
        
        if (b.getAttribute('data-filter-value') === value) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      
      // Apply filters immediately
      applyFilters();
    }

    function applyFilters() {
      var cards = document.querySelectorAll('.channel-card');
      var visibleCount = 0;
      
      cards.forEach(function(card) {
        var cardCtype = card.getAttribute('data-ctype') || 'long';
        var cardCat = card.getAttribute('data-cat') || 'semcategoria';
        var cardAud = card.getAttribute('data-aud') || 'general';
        
        var show = true;
        
        if (filterState.ctype === 'shorts' && cardCtype !== 'shorts') show = false;
        if (filterState.ctype === 'long' && cardCtype !== 'long') show = false;
        if (filterState.cat !== 'all' && cardCat !== filterState.cat) show = false;
        if (filterState.aud === 'kids' && cardAud !== 'kids') show = false;
        if (filterState.aud === 'educational' && cardAud !== 'educational') show = false;
        if (filterState.aud === 'general' && cardAud !== 'general') show = false;
        
        if (show) {
          card.style.display = 'block';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });
      
      var emptyState = document.getElementById('emptyState');
      var channelsTitle = document.getElementById('channelsTitle');
      
      if (visibleCount === 0) {
        emptyState.style.display = 'block';
        channelsTitle.textContent = 'Nenhum vídeo encontrado';
      } else {
        emptyState.style.display = 'none';
        channelsTitle.textContent = 'Vídeos (' + visibleCount + ' de ' + cards.length + ')';
      }
    }

    /* Reference Video Functions */
    function extractYouTubeId(url) {
      if (!url) return null;
      var s = String(url).trim();
      var m = s.match(/(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/)|youtu\\.be\\/)([^&?#\\/]+)/);
      if (m && m[1]) return m[1];
      m = s.match(/[?&]v=([^&?#]+)/);
      if (m && m[1]) return m[1];
      if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) return s;
      return null;
    }

    function setReferenceVideo(id, title, script) {
      currentReferenceId = id;
      currentReferenceTitle = title || ('Vídeo ' + id);
      currentReferenceScript = script || 'Analisar este vídeo e extrair ideias principais para criar um roteiro reescrito (sem copiar 100%).';
      
      var refCurrent = document.getElementById('referenceCurrent');
      var refBanner = document.getElementById('referenceBanner');
      var refPreviewCard = document.getElementById('referencePreviewCard');
      var refTitle = document.getElementById('refCurrentTitle');
      var bannerTitle = document.getElementById('bannerTitle');
      var refUrl = document.getElementById('refCurrentUrl');
      var bannerUrl = document.getElementById('bannerUrl');
      var refPreviewTitle = document.getElementById('refPreviewTitle');
      var refPreviewUrl = document.getElementById('refPreviewUrl');
      var refPreviewIdeas = document.getElementById('refPreviewIdeas');
      var refThumbnail = document.getElementById('refThumbnail');
      var watchUrl = 'https://www.youtube.com/watch?v=' + id;
      
      if (refCurrent) refCurrent.classList.add('show');
      if (refBanner) refBanner.classList.add('show');
      if (refPreviewCard) refPreviewCard.classList.add('show');
      if (refTitle) refTitle.textContent = currentReferenceTitle;
      if (bannerTitle) bannerTitle.textContent = '📹 Vídeo de Referência: ' + currentReferenceTitle;
      if (refUrl) refUrl.textContent = 'URL: ' + watchUrl;
      if (bannerUrl) bannerUrl.textContent = 'URL: ' + watchUrl;
      if (refPreviewTitle) refPreviewTitle.textContent = currentReferenceTitle;
      if (refPreviewUrl) refPreviewUrl.textContent = watchUrl;
      if (refPreviewIdeas) refPreviewIdeas.textContent = currentReferenceScript;
      if (refThumbnail) {
        refThumbnail.innerHTML = '';
        var img = document.createElement('img');
        img.src = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
        img.alt = 'Thumbnail da referência';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = function() {
          refThumbnail.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#666;background:#222;">Sem thumbnail</div>';
        };
        var overlay = document.createElement('div');
        overlay.className = 'ref-play-overlay';
        overlay.onclick = function() { watchReferenceVideo(); };
        overlay.innerHTML = '<div class="ref-play-btn"></div>';
        refThumbnail.appendChild(img);
        refThumbnail.appendChild(overlay);
      }
      
      // Select in dropdown if exists
      var refSelect = document.getElementById('referenceVideo');
      if (refSelect) {
        var found = false;
        for (var i = 0; i < refSelect.options.length; i++) {
          if (refSelect.options[i].value === id) { found = true; break; }
        }
        if (!found) {
          var opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id + ' - ' + currentReferenceTitle;
          refSelect.appendChild(opt);
        }
        refSelect.value = id;
      }
      
      showToast('📹 Referência definida: ' + currentReferenceTitle);
      if (refPreviewCard) {
        try { refPreviewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e) {}
      }
    }

    function clearReferenceVideo() {
      var refCurrent = document.getElementById('referenceCurrent');
      var refBanner = document.getElementById('referenceBanner');
      var refPreviewCard = document.getElementById('referencePreviewCard');
      if (refCurrent) refCurrent.classList.remove('show');
      if (refBanner) refBanner.classList.remove('show');
      if (refPreviewCard) refPreviewCard.classList.remove('show');
      currentReferenceId = '';
      currentReferenceTitle = '';
      currentReferenceScript = '';
      showToast('📹 Referência removida');
    }

    function watchReferenceVideo() {
      if (!currentReferenceId) {
        showToast('⚠️ Nenhuma referência selecionada');
        return;
      }
      openVideoModal(currentReferenceId, currentReferenceTitle || 'Referência', '0', 'Referência', false);
    }

    function cloneFromReference() {
      if (!currentReferenceId) {
        showToast('⚠️ Selecione ou adicione uma referência primeiro');
        return;
      }
      var cloneName = prompt('Nome para o clone baseado nesta referência:', currentReferenceTitle || 'Meu Clone');
      if (cloneName) {
        showToast('🎯 Criando clone com referência: ' + currentReferenceTitle);
        var nameInput = document.getElementById('cloneName');
        var refInput = document.getElementById('referenceVideo');
        if (nameInput) nameInput.value = cloneName;
        if (refInput) {
          var found = false;
          for (var i = 0; i < refInput.options.length; i++) {
            if (refInput.options[i].value === currentReferenceId) { found = true; break; }
          }
          if (!found) {
            var opt = document.createElement('option');
            opt.value = currentReferenceId;
            opt.textContent = currentReferenceId + ' - ' + currentReferenceTitle;
            refInput.appendChild(opt);
          }
          refInput.value = currentReferenceId;
        }
        showToast('✅ Referência pronta para clonagem!');
      }
    }

    function addReferenceVideo() {
      var urlInput = document.getElementById('referenceUrl');
      var url = urlInput ? urlInput.value.trim() : '';
      if (!url) {
        showToast('⚠️ Digite uma URL do YouTube');
        return;
      }
      var id = extractYouTubeId(url);
      if (!id) {
        showToast('⚠️ URL/ID inválido. Cole um link do YouTube válido.');
        return;
      }
      setReferenceVideo(id, 'Referência: ' + id, 'Vídeo adicionado como referência. Clique em Assistir para visualizar e em Clonar para usar como base de roteiro.');
      showToast('✅ Vídeo de referência carregado na tela');
    }

    /* Video Functions */
    function openVideoModal(videoId, title, views, category, isShort) {
      if (!videoId) { showToast('⚠️ Vídeo sem ID'); return; }
      currentVideoId = videoId;
      currentVideoTitle = title || '';
      currentVideoViews = views || '0';
      currentVideoCategory = category || '';
      // Determine if short (param, or infer from DOM card)
      var shortFlag = !!isShort;
      if (!shortFlag) {
        var card = document.querySelector('.channel-card[onclick*="' + videoId + '"]');
        if (card && card.getAttribute('data-ctype') === 'shorts') shortFlag = true;
      }
      currentVideoIsShort = shortFlag;
      currentVideoWatchUrl = (shortFlag ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=') + videoId;
      
      var modalTitle = document.getElementById('modalVideoTitle');
      var infoTitle = document.getElementById('modalVideoInfoTitle');
      var infoViews = document.getElementById('modalVideoInfoViews');
      var infoCat = document.getElementById('modalVideoInfoCategory');
      var hint = document.getElementById('modalVideoHint');
      var iframe = document.getElementById('modalVideoIframe');
      var modal = document.getElementById('videoModal');
      
      if (modalTitle) modalTitle.textContent = currentVideoTitle + (shortFlag ? ' [SHORTS]' : '');
      if (infoTitle) infoTitle.textContent = currentVideoTitle;
      if (infoViews) infoViews.textContent = '👁️ ' + String(currentVideoViews) + ' visualizações';
      if (infoCat) infoCat.textContent = '📂 Categoria: ' + String(currentVideoCategory) + (shortFlag ? ' • Formato: Shorts' : ' • Formato: Vídeo longo');
      if (hint) hint.textContent = shortFlag
        ? 'Shorts: se o embed não tocar aqui, clique em "Abrir no YouTube" para ver no formato original (vertical).'
        : 'Se o player não carregar aqui (restrição/propaganda do YouTube), use "Abrir no YouTube".';
      // Use embed; for shorts this often works, but we always provide direct link.
      if (iframe) iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0&playsinline=1';
      if (modal) modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function openCurrentOnYouTube() {
      if (!currentVideoId) return;
      var url = currentVideoWatchUrl || ('https://www.youtube.com/watch?v=' + currentVideoId);
      window.open(url, '_blank');
    }

    function closeVideoModal() {
      var modal = document.getElementById('videoModal');
      var iframe = document.getElementById('modalVideoIframe');
      if (modal) modal.classList.remove('show');
      if (iframe) iframe.src = '';
      document.body.style.overflow = '';
    }

    // -------- Clone telemetry (real) --------
    var clonePollTimer = null;
    var currentCloneJobId = '';
    var currentCloneOutDir = '';

    function getSelectedVideoUrl(videoId) {
      if (!videoId) return '';
      var card = document.querySelector(".channel-card[onclick*='\" + videoId + "']");
      var isShort = card && card.getAttribute('data-ctype') === 'shorts';
      return (isShort ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=') + videoId;
    }

    function renderCloneTelemetry(job) {
      var el = function (id) { return document.getElementById(id); };
      if (!job) return;

      var status = job.status || 'unknown';
      var running = status === 'running';
      var pct = Math.max(0, Math.min(100, Number(job.progress || 0)));

      // ---- header --------------------------------------------------------
      var dot = el('tmDot');
      if (dot) dot.className = 'dot ' + (status === 'done' ? 'ok' : status === 'failed' ? 'err' : running ? 'run' : '');
      var title = el('tmTitle');
      if (title) title.textContent = running ? 'Clone em execução' : status === 'done' ? 'Clone concluído' : status === 'failed' ? 'Clone falhou' : 'Painel de telemetria';
      var st = el('tmStatus');
      if (st) { st.textContent = String(status).toUpperCase(); st.className = 'tm-pill ' + (status === 'done' ? 'ok' : status === 'failed' ? 'err' : running ? 'run' : 'ghost'); }
      var jid = el('tmJobId');
      if (jid) jid.textContent = job.id ? 'job ' + job.id : 'sem job';

      // ---- bar ------------------------------------------------------------
      var bar = el('tmBar');
      if (bar) {
        bar.className = 'tm-bar' + (status === 'done' ? ' ok' : status === 'failed' ? ' err' : (!pct ? ' indet' : ''));
        var fill = bar.querySelector('i');
        if (fill) fill.style.width = (status === 'done' ? 100 : pct) + '%';
      }
      var pctEl = el('tmPct');
      if (pctEl) pctEl.textContent = status === 'done' ? '100% — concluído' : (pct ? pct + '%' : (running ? 'a arrancar…' : '—'));
      var clock = el('tmClock');
      if (clock) clock.textContent = job.elapsedText || '00:00';

      // ---- stepper --------------------------------------------------------
      var stepsEl = el('tmSteps');
      if (stepsEl) {
        var phases = Array.isArray(job.phases) ? job.phases : [];
        if (!phases.length) {
          stepsEl.innerHTML = '<div class="tm-step-pill"><span class="s"></span>aguardando início</div>';
        } else {
          stepsEl.innerHTML = phases.map(function (p) {
            var cls = 'tm-step-pill ' + (p.state || 'pending');
            return '<div class="' + cls + '"><span class="s"></span>' + escapeHtml(p.label) + '</div>';
          }).join('');
        }
      }

      // ---- cells ----------------------------------------------------------
      var cur = el('tmCurrent');
      if (cur) cur.textContent = job.currentStep || (running ? 'Executando…' : '—');
      var proj = el('tmProject');
      if (proj) proj.innerHTML = escapeHtml(job.slug || '—') + '<small>' + escapeHtml(job.outputDir || '') + '</small>';
      var cnt = el('tmStepCount');
      if (cnt) cnt.textContent = String((job.steps || []).length);

      var elapsedEl = el('tmElapsed');
      if (elapsedEl) elapsedEl.textContent = job.elapsedText || '-';
      var etaEl = el('tmEta');
      if (etaEl) etaEl.textContent = job.etaText || '-';

      // ---- timeline -------------------------------------------------------
      var tl = el('tmTimeline');
      if (tl) {
        var steps = Array.isArray(job.steps) ? job.steps.slice(-40).reverse() : [];
        if (!steps.length) {
          tl.innerHTML = '<div class="tm-empty">Sem etapas registadas ainda.</div>';
        } else {
          tl.innerHTML = steps.map(function (s, i) {
            var t = s && s.at ? new Date(s.at).toLocaleTimeString('pt-BR') : '';
            var m = s && s.msg ? s.msg : JSON.stringify(s);
            return '<div class="tm-tl-row' + (i === 0 ? ' now' : '') + '"><span class="t">' + escapeHtml(t) + '</span><span>' + escapeHtml(String(m)) + '</span></div>';
          }).join('');
        }
      }

      // ---- log ------------------------------------------------------------
      var logEl = el('tmLog');
      if (logEl) {
        var lines = Array.isArray(job.logLines) && job.logLines.length ? job.logLines : (job.logTail ? String(job.logTail).split('\\n') : []);
        if (!lines.length) {
          logEl.textContent = 'Sem log ainda…';
        } else {
          logEl.innerHTML = lines.slice(-260).map(function (l) {
            var safe = escapeHtml(String(l));
            var cls = l.indexOf('[erro]') === 0 ? 'err' : (l.indexOf('ok ->') >= 0 || l.indexOf('PREFLIGHT: OK') >= 0 ? 'ok' : '');
            return cls ? '<span class="' + cls + '">' + safe + '</span>' : safe;
          }).join('\\n');
          logEl.scrollTop = logEl.scrollHeight;
        }
      }

      // ---- artifacts ------------------------------------------------------
      var artEl = el('tmArtifacts');
      if (artEl) {
        var html = '';
        var a = job.artifacts || {};
        var prev = a.previews || {};
        var base = '/clones/' + encodeURIComponent(job.slug || '');
        var any = false;
        if (prev.videos && prev.videos.length) {
          any = true;
          prev.videos.slice(0, 4).forEach(function (f) {
            var url = base + '/' + encodeURI(f.rel || f.name);
            html += '<div class="tm-art"><video controls preload="metadata" src="' + url + '"></video><div class="cap"><a href="' + url + '" target="_blank">' + escapeHtml(f.rel || f.name) + '</a></div></div>';
          });
        }
        if (prev.images && prev.images.length) {
          any = true;
          prev.images.slice(0, 6).forEach(function (f) {
            var url = base + '/' + encodeURI(f.rel || f.name);
            html += '<div class="tm-art"><img src="' + url + '" alt=""><div class="cap"><a href="' + url + '" target="_blank">' + escapeHtml(f.rel || f.name) + '</a></div></div>';
          });
        }
        if (a.files && a.files.length) {
          var rest = a.files.filter(function (f) {
            if (!prev.videos) return true;
            if (prev.images) return true;
            return true;
          });
          html += '<div class="tm-art" style="grid-column:1/-1;padding:12px 14px;"><div class="cap" style="padding:0 0 8px;">' + a.files.length + ' ficheiro(s) na pasta</div><div class="tm-files">';
          a.files.slice(0, 60).forEach(function (f) {
            var url = base + '/' + encodeURI(f.rel || f.name);
            html += '<a href="' + url + '" target="_blank">' + escapeHtml(f.rel || f.name) + '<span class="sz">' + Math.round((f.size || 0) / 1024) + ' KB</span></a>';
          });
          html += '</div></div>';
        }
        if (!any) html = '<div class="tm-empty">Ainda não há ficheiros. Aparecem aqui assim que o pipeline os escreve.</div>';
        artEl.innerHTML = html;
      }

      currentCloneOutDir = job.outputDir || '';
    }

    function toggleTmTimeline() {
      var tl = document.getElementById('tmTimeline');
      if (tl) tl.style.display = (tl.style.display === 'none') ? '' : 'none';
    }
    function toggleTmLog() {
      var lg = document.getElementById('tmLog');
      if (lg) lg.style.display = (lg.style.display === 'none') ? '' : 'none';
    }
    function copyTmLog() {
      var lg = document.getElementById('tmLog');
      if (!lg) return;
      var txt = lg.innerText || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function(){ showToast('Log copiado.'); }, function(){ showToast('Não foi possível copiar.'); });
      } else {
        showToast('Clipboard indisponível neste browser.');
      }
    }
    function scrollToTelemetry() {
      var p = document.getElementById('telemetryPanel');
      if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderCloneError(message) {
      var el = function (id) { return document.getElementById(id); };
      var dot = el('tmDot');
      if (dot) dot.className = 'dot err';
      var title = el('tmTitle');
      if (title) title.textContent = 'Não foi possível iniciar o clone';
      var st = el('tmStatus');
      if (st) { st.textContent = 'ERRO'; st.className = 'tm-pill err'; }
      var bar = el('tmBar');
      if (bar) { bar.className = 'tm-bar err'; var f = bar.querySelector('i'); if (f) f.style.width = '100%'; }
      var cur = el('tmCurrent');
      if (cur) cur.textContent = 'Erro ao iniciar/acompanhar o clone';
      var logEl = el('tmLog');
      if (logEl) logEl.innerHTML = '<span class="err">' + escapeHtml(String(message || 'Erro desconhecido')) + '</span>';
      var tl = el('tmTimeline');
      if (tl) tl.innerHTML = '<div class="tm-tl-row now"><span class="t">' + new Date().toLocaleTimeString('pt-BR') + '</span><span>' + escapeHtml(String(message || 'Erro desconhecido')) + '</span></div>';
    }

    async function pollCloneStatus(jobId) {
      if (!isDaemonMode()) return;
      if (clonePollTimer) clearInterval(clonePollTimer);
      var tick = async function() {
        try {
          var res = await fetch('/clone/status?id=' + encodeURIComponent(jobId || currentCloneJobId || ''));
          var data = await res.json().catch(function(){ return {}; });
          if (!res.ok || !data.ok || !data.job) {
            if (res.status === 404) return; // not ready yet
            return;
          }
          renderCloneTelemetry(data.job);
          if (data.job.status === 'done' || data.job.status === 'failed') {
            clearInterval(clonePollTimer); clonePollTimer = null;
            showToast(data.job.status === 'done' ? 'Clone concluído! Veja a telemetria e os arquivos gerados.' : 'Clone falhou. Veja o log na telemetria.');
          }
        } catch (e) {
          // transient polling error, keep trying while running
        }
      };
      await tick();
      clonePollTimer = setInterval(tick, 1500);
    }

    async function startCloneJobReal(payload) {
      if (!isDaemonMode()) {
        renderCloneError('Abra o painel pelo launcher (launch-dashboard.bat) para executar clones. No modo arquivo local o botão não consegue rodar o processo.');
        showToast('Abra pelo launcher do painel para iniciar o clone com telemetria.');
        return;
      }
      if (!payload.url) {
        renderCloneError('URL do vídeo de referência não informada.');
        showToast('Selecione/adicione um vídeo de referência primeiro.');
        return;
      }
      var bar = document.getElementById('tmBar');
      var logEl = document.getElementById('tmLog');
      var stepsEl = document.getElementById('tmSteps');
      var st = document.getElementById('tmStatus');
      var dot = document.getElementById('tmDot');
      if (bar) { bar.className = 'tm-bar indet'; }
      if (st) { st.textContent = 'A INICIAR'; st.className = 'tm-pill run'; }
      if (dot) dot.className = 'dot run';
      if (logEl) logEl.textContent = 'A enviar o pedido de clone ao servidor local...';
      if (stepsEl) stepsEl.innerHTML = '<div class="tm-step-pill active"><span class="s"></span>a iniciar</div>';
      try {
        var res = await fetch('/clone/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var data = await res.json().catch(function(){ return {}; });
        if (!res.ok || data.ok === false) {
          renderCloneError(data.error || ('Falha ao iniciar clone (HTTP ' + res.status + ')'));
          return;
        }
        currentCloneJobId = data.jobId || (data.job && data.job.id) || '';
        if (data.job) renderCloneTelemetry(data.job);
        showToast('Clone iniciado! Acompanhe a telemetria abaixo.');
        pollCloneStatus(currentCloneJobId);
      } catch (e) {
        renderCloneError('Não foi possível falar com o servidor local. Abra o painel pelo launch-dashboard.bat. Detalhe: ' + (e && e.message ? e.message : e));
      }
    }

    function refreshCloneTelemetry() {
      if (!isDaemonMode()) { showToast('Abra pelo launcher para ver telemetria em tempo real.'); return; }
      if (currentCloneJobId) { pollCloneStatus(currentCloneJobId); return; }
      fetch('/clone/active').then(r=>r.json()).then(d=>{ if(d && d.job){ currentCloneJobId=d.job.id; renderCloneTelemetry(d.job); pollCloneStatus(currentCloneJobId);} else { showToast('Nenhum clone ativo encontrado.'); } }).catch(function(){ showToast('Não foi possível atualizar telemetria.'); });
    }

    function openCloneOutputFolder() {
      if (currentCloneOutDir) {
        showToast('Pasta de saída: ' + currentCloneOutDir);
        try { navigator.clipboard && navigator.clipboard.writeText(currentCloneOutDir); } catch(e) {}
      } else {
        showToast('A pasta de saída aparecerá aqui quando o clone iniciar.');
      }
    }

    function cloneThisVideo() {
      if (!currentVideoId) { showToast('Selecione um vídeo primeiro.'); return; }
      var cloneName = prompt('Nome para o clone do vídeo:', currentVideoTitle || ('clone_' + currentVideoId));
      if (!cloneName) return;
      var url = currentVideoWatchUrl || getSelectedVideoUrl(currentVideoId) || ('https://www.youtube.com/watch?v=' + currentVideoId);
      var payload = {
        url: url,
        id: currentVideoId,
        name: cloneName,
        prompt: cloneName,
        channel: currentVideoCategory || '',
        params: {
          slug: String(cloneName).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40) || ('clone_' + currentVideoId),
          referenceId: currentReferenceId || '',
          sourceVideoId: currentVideoId,
        }
      };
      document.getElementById('cloneName').value = cloneName;
      startCloneJobReal(payload);
    }

    function cloneFromCard(videoId, title) {
      currentVideoId = videoId;
      currentVideoTitle = title || '';
      currentVideoWatchUrl = getSelectedVideoUrl(videoId) || ('https://www.youtube.com/watch?v=' + videoId);
      cloneThisVideo();
    }

    function createClone() {
      var name = document.getElementById('cloneName').value.trim();
      var sourceVideo = document.getElementById('sourceVideo').value;
      var referenceVideo = document.getElementById('referenceVideo').value;
      if (!name) {
        showToast('⚠️ Digite um nome para o clone/projeto');
        renderCloneError('Digite um nome para o clone/projeto antes de iniciar.');
        return;
      }
      var refId = referenceVideo || currentReferenceId || sourceVideo || currentVideoId || '';
      if (!refId) {
        renderCloneError('Selecione um vídeo de referência/base. Sem referência o sistema não sabe qual vídeo analisar/clonar.');
        showToast('Selecione um vídeo de referência ou base.');
        return;
      }
      var url = getSelectedVideoUrl(refId) || ('https://www.youtube.com/watch?v=' + refId);
      var payload = {
        url: url,
        id: refId,
        name: name,
        prompt: name,
        channel: currentVideoCategory || '',
        params: {
          slug: String(name).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40) || ('clone_' + Date.now()),
          referenceId: refId,
          sourceVideoId: sourceVideo || ''
        }
      };
      startCloneJobReal(payload);
    }

    async function checkCloneStatus() {
      if (!isDaemonMode()) return;
      try {
        var res = await fetch('/clone/active');
        var data = await res.json().catch(function(){ return {}; });
        if (data && data.job) {
          currentCloneJobId = data.job.id;
          renderCloneTelemetry(data.job);
          if (data.job.status === 'running') pollCloneStatus(currentCloneJobId);
        }
      } catch (e) {}
    }

    // Close modal on outside click
    var videoModalEl = document.getElementById('videoModal');
    if (videoModalEl) videoModalEl.addEventListener('click', function(e) {
      if (e.target.id === 'videoModal') closeVideoModal();
    });

    // Close modal on ESC key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeVideoModal();
    });

    // Initialize filters on page load
    document.addEventListener('DOMContentLoaded', function() {
      applyFilters();
      checkCollectStatus();
      checkCloneStatus();
    });

    var collectPollTimer = null;
    function isDaemonMode() { return location.protocol === 'http:' || location.protocol === 'https:'; }

    function setCollectUI(running, message) {
      var btn = document.getElementById('collectBtn');
      var status = document.getElementById('collectStatus');
      if (btn) {
        btn.disabled = !!running;
        btn.textContent = running ? '⏳ Buscando vídeos... aguarde' : '🔍 Buscar vídeos por categoria (Top 20 + Shorts)';
        btn.style.opacity = running ? '0.7' : '1';
        btn.style.cursor = running ? 'wait' : 'pointer';
      }
      if (status && message) status.textContent = message;
    }

    async function startCollectTargets() {
      var status = document.getElementById('collectStatus');
      if (!isDaemonMode()) {
        if (status) status.textContent = '⚠️ Para buscar vídeos automaticamente, abra o painel pelo botão/atalho "launch-dashboard.bat" (modo servidor). Depois clique aqui novamente.';
        showToast('Abra pelo launcher do painel para usar a busca automática.');
        return;
      }
      setCollectUI(true, 'Iniciando busca de vídeos por categoria e Shorts... pode levar alguns minutos. Não feche esta página.');
      try {
        var res = await fetch('/collect-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ top: 20, shorts: 10 })
        });
        var data = await res.json().catch(function(){ return {}; });
        if (!res.ok || data.ok === false) {
          setCollectUI(false, 'Erro ao iniciar: ' + (data.error || 'tente novamente'));
          return;
        }
        if (data.started === false && data.reason === 'already_running') {
          setCollectUI(true, 'A busca já está em andamento. Aguarde...');
        }
        startCollectPolling();
      } catch (e) {
        setCollectUI(false, 'Não foi possível iniciar a busca. Verifique se o painel foi aberto pelo launcher (servidor local).');
      }
    }

    async function checkCollectStatus() {
      if (!isDaemonMode()) return;
      try {
        var res = await fetch('/collect-targets/status');
        if (!res.ok) return;
        var data = await res.json();
        var job = data && data.job ? data.job : null;
        if (!job) return;
        if (job.running) {
          setCollectUI(true, job.message || 'Buscando vídeos... aguarde.');
          startCollectPolling();
        } else if (job.finishedAt) {
          setCollectUI(false, job.message || 'Pronto.');
        }
      } catch (e) {}
    }

    function startCollectPolling() {
      if (collectPollTimer) return;
      collectPollTimer = setInterval(async function() {
        try {
          var res = await fetch('/collect-targets/status');
          if (!res.ok) return;
          var data = await res.json();
          var job = data && data.job ? data.job : null;
          if (!job) return;
          if (job.running) {
            setCollectUI(true, job.message || 'Buscando vídeos... aguarde alguns minutos.');
            return;
          }
          clearInterval(collectPollTimer); collectPollTimer = null;
          setCollectUI(false, job.message || (job.ok ? 'Busca concluída!' : 'Busca finalizada.'));
          if (job.ok) {
            showToast('Busca concluída. Atualizando a página com novos vídeos...');
            setTimeout(function(){ location.reload(); }, 1500);
          }
        } catch (e) {}
      }, 4000);
    }
  </script>

  <!-- WATCHDOG: separate script tag on purpose. If the block above fails to
       parse (stale cached page, broken escape), THIS block still runs and
       tells the user exactly what to do instead of leaving dead buttons. -->
  <script>
  (function () {
    var missing = [];
    var required = ['setFilter','applyFilters','openVideoModal','cloneFromCard','createClone',
                    'startCloneJobReal','startCollectTargets','showToast'];
    for (var i = 0; i < required.length; i++) {
      if (typeof window[required[i]] !== 'function') missing.push(required[i]);
    }
    if (!missing.length) return;

    var bar = document.createElement('div');
    bar.setAttribute('id', 'stalePageWarning');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;' +
      'padding:14px 20px;font-family:Segoe UI,Tahoma,sans-serif;font-size:15px;line-height:1.5;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.35);';
    var reloadFn = 'location.replace(location.pathname + String.fromCharCode(63) + ' +
                   'String.fromCharCode(118) + String.fromCharCode(61) + Date.now())';
    bar.innerHTML =
      '<strong>⚠️ Esta página está com uma versão antiga em cache — os botões não vão funcionar.</strong><br>' +
      'Funções que faltam: <code>' + missing.join(', ') + '</code><br>' +
      '<button id="staleReloadBtn" style="margin-top:8px;background:#fff;color:#b91c1c;border:none;' +
      'padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;">' +
      '🔄 Recarregar agora (versão nova)</button> ' +
      '<span style="opacity:.9;font-size:13px;">ou feche a aba e abra pelo launch-dashboard.bat (Ctrl+F5 também resolve)</span>';
    document.body.appendChild(bar);
    var btn = document.getElementById('staleReloadBtn');
    if (btn) btn.addEventListener('click', function () { eval(reloadFn); });
  })();
  </script>
</body>
</html>`;

  return html;
}

function generateCategoryButtons(categories) {
  let html = '';
  for (let [key, info] of Object.entries(categories)) {
    const shortsInfo = info.shorts ? ` · ${info.shorts} shorts` : '';
    html += '<button class="filter-btn" data-filter-type="cat" data-filter-value="' + key + '" onclick="setFilter(\'cat\',\'' + key + '\',this)">' + escapeHtml(info.label) + ' <span class="filter-count">' + info.count + shortsInfo + '</span></button>';
  }
  return html;
}

function generateVideoCards(videos) {
  let html = '';
  for (let v of videos) {
    const videoId = v.id || '';
    if (!videoId) continue;
    const videoTitle = v.title || 'Sem vídeo';
    const category = v.category || 'Sem categoria';
    const catKey = v.categoryKey || String(category).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'') || 'semcategoria';
    const duration = Number(v.duration || 0);
    const isShort = isShortVideo(duration, videoTitle);
    const contentType = isShort ? 'shorts' : 'long';
    const audienceType = v.audience || 'general';
    const viewsStr = (v.viewsLabel || (v.views != null ? Number(v.views).toLocaleString('pt-BR') : '0')).toString();
    const videoUrl = v.url || ('https://www.youtube.com/watch?v=' + videoId);
    const thumb = v.thumbnail || ('https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg');
    const safeTitleJs = escapeHtml(videoTitle).replace(/'/g, "\\'");
    const safeCatJs = escapeHtml(category).replace(/'/g, "\\'");
    const durText = duration > 0 ? (Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0')) : '';
    html += `
    <div class="channel-card"
         data-ctype="${contentType}"
         data-cat="${catKey}"
         data-aud="${audienceType}"
         onclick="openVideoModal('${videoId}', '${safeTitleJs}', '${viewsStr}', '${safeCatJs}', ${isShort ? 'true' : 'false'})">
      <div class="video-preview">
        <img src="${thumb}" alt="Video thumbnail" loading="lazy">
        ${durText ? `<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.7);color:white;padding:2px 6px;border-radius:4px;font-size:0.75em;">${durText}</div>` : ''}
        ${isShort ? '<div style="position:absolute;top:8px;left:8px;background:#ff0000;color:white;padding:3px 8px;border-radius:20px;font-size:0.7em;font-weight:bold;z-index:3;">SHORTS</div>' : ''}
        <div class="hover-overlay"><div class="play-btn"></div></div>
      </div>
      <div class="card-body">
        <span class="category-tag">${escapeHtml(category)}</span>
        <h4 class="card-title">${escapeHtml(videoTitle)}</h4>
        <div class="card-stats">
          <span class="stat-item">📺 ${escapeHtml(v.channel || 'Canal')}</span>
          <span class="stat-item">👁️ ${viewsStr} views</span>
        </div>
        <a href="${videoUrl}" target="_blank" class="view-on-youtube" onclick="event.stopPropagation()">Ver no YouTube →</a>
        <button class="clone-btn-card" onclick="event.stopPropagation(); cloneFromCard('${videoId}', '${safeTitleJs}');">Clonar</button>
      </div>
    </div>
    `;
  }
  return html;
}

function generateChannelCards(items) {
  return generateVideoCards(items || []);
}

function generateChannelOptions(items) {
  let html = '';
  const seen = new Set();
  for (let it of (items || [])) {
    if (it && it.id && it.title) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const label = (it.channel ? it.channel + ' — ' : '') + it.title;
      html += `<option value="${it.id}">${escapeHtml(label.length > 80 ? label.slice(0,77)+'...' : label)}</option>`;
      continue;
    }
    if (it && it.channel_id) {
      if (seen.has(it.channel_id)) continue;
      seen.add(it.channel_id);
      html += `<option value="${it.channel_id}">${escapeHtml(it.channel || it.channel_id)}</option>`;
    }
  }
  return html;
}

function generateReferenceOptions(references) {
  let html = '';
  for (let ref of references) {
    html += `<option value="${ref.id}">${ref.id} - ${escapeHtml(ref.title)}</option>`;
  }
  return html;
}

function generateRecentClones(clones) {
  if (clones.length === 0) return '<p style="color:#6c757d;">Nenhum clone recente</p>';
  let html = '';
  for (let clone of clones) {
    html += `
    <div style="background:#f8f9fa;padding:14px;border-radius:8px;margin-bottom:12px;">
      <h4 style="color:#333;margin-bottom:8px;">${escapeHtml(clone.name)}</h4>
      <p style="color:#6c757d;font-size:0.85em;">ID: ${clone.id} | Criado: ${new Date(clone.createdAt).toLocaleString('pt-BR')}</p>
      ${clone.script ? '<p style="color:#495057;font-size:0.8em;">' + escapeHtml(clone.script.substring(0, 180)) + '...</p>' : ''}
    </div>
    `;
  }
  return html;
}

function main() {
  const referenceManager = new ReferenceVideoManager();
  const cloneManager = new CloneManager(referenceManager);

  const data = loadDashboardData();
  const videos = data.videos || [];

  const html = generateHTML(videos, referenceManager, cloneManager, data);

  // ---- SAFETY GATE -------------------------------------------------------
  // The browser script lives inside a template literal, so a stray "\n" in the
  // source turns into a REAL newline in the emitted JS and silently kills
  // EVERY function on the page (filters, clone, collect...). Never ship that.
  // We parse the emitted inline script and refuse to write a broken page.
  const inlineScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const broken = [];
  inlineScripts.forEach((js, i) => {
    try {
      new Function(js); // throws SyntaxError on malformed JS
    } catch (err) {
      broken.push({ index: i, message: String(err.message), preview: js.slice(0, 120) });
    }
  });
  if (broken.length) {
    console.error('\n❌ ABORTADO: o JavaScript inline do dashboard tem erro de sintaxe.');
    broken.forEach(b => {
      console.error(`   script[${b.index}]: ${b.message}`);
      const m = /(\d+)/.exec(b.message);
      if (m) {
        const ln = parseInt(m[1], 10) - 1;
        const ctx = b.preview.split('\\n').slice(Math.max(0, ln - 2), ln + 2).join('\n');
        console.error('   contexto:\n' + ctx);
      }
    });
    console.error('\n   Causa provável: "\\n" dentro do template literal precisa ser "\\\\n".');
    console.error('   O arquivo NÃO foi escrito para não publicar uma página quebrada.\n');
        if (process.env.ARTCRAFT_FORCE_DASH === '1') {
      console.error('   ARTCRAFT_FORCE_DASH=1 -> a escrever mesmo assim (modo debug).\n');
    } else {
      process.exit(1);
    }
  }
  // -----------------------------------------------------------------------

  fs.writeFileSync(path.join(CONFIG.outDir, 'index.html'), html, 'utf8');

  console.log('Enhanced YT Dashboard generated');
  console.log('Mode:', data.mode);
  console.log('Videos:', videos.length);
  console.log('Inline JS: OK (' + inlineScripts.length + ' script tag(s) validated)');
  console.log('Output:', path.join(CONFIG.outDir, 'index.html'));
}

main();