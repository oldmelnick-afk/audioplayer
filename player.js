(() => {
  const PUBLIC_FOLDER_LINK = 'https://disk.yandex.ru/d/nQ8Hwia3_31HPA';
  const API_BASE = 'https://cloud-api.yandex.net/v1/disk/public';
  const PROXY = 'https://calm-recipe-9991.oldmelnick.workers.dev/?pk=';
  
  const audio    = document.getElementById('audio');
  const listEl   = document.getElementById('list');
  const nowTitle = document.getElementById('nowTitle');
  const nowArtist= document.getElementById('nowArtist');
  const seek     = document.getElementById('seek');
  const cur      = document.getElementById('cur');
  const dur      = document.getElementById('dur');
  const playBtn  = document.getElementById('playBtn');
  const prevBtn  = document.getElementById('prevBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const muteBtn  = document.getElementById('muteBtn');
  const AUDIO_EXT= ['.mp3','.m4a','.ogg','.wav','.webm'];
  let tracks = [], current = 0;

  // ===== helpers =====
  function fmtTime(s){ s=Math.max(0,Math.floor(s||0)); const m=Math.floor(s/60), ss=(s%60).toString().padStart(2,'0'); return m+':'+ss; }
  function rangeBg(el,r){ el.style.setProperty('--val', Math.max(0,Math.min(100,r*100))+'%'); }

  async function fetchJSON(url){
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      throw new Error('HTTP '+res.status+' '+res.statusText+' for '+url+'\n'+text);
    }
    return res.json();
  }

  // ====== marquee helpers for nowTitle ======
  function ensureTitleSpan(){
    let span = nowTitle.querySelector('span');
    if (!span){
      span = document.createElement('span');
      span.textContent = nowTitle.textContent || '';
      nowTitle.textContent = '';
      nowTitle.appendChild(span);
    }
    return span;
  }
  function setTitleText(text){
    const span = ensureTitleSpan();
    span.textContent = text || '';
  }
  function updateTitleScroll(){
    const span = ensureTitleSpan();
    const needScroll = (span.scrollWidth > nowTitle.clientWidth) && !audio.paused;
    nowTitle.classList.toggle('scrolling', needScroll);
  }
  let _rAF;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(_rAF);
    _rAF = requestAnimationFrame(updateTitleScroll);
  });

  // ====== data loading ======
  async function loadTracks(){
    try{
      const listUrl = API_BASE + '/resources?public_key=' + encodeURIComponent(PUBLIC_FOLDER_LINK) + '&limit=200';
      const data = await fetchJSON(listUrl);
      const items = (data._embedded && data._embedded.items) || [];
      const files = items.filter(it => {
        const n = (it.name||'').toLowerCase();
        const looks = (it.mime_type && it.mime_type.startsWith('audio')) || AUDIO_EXT.some(e => n.endsWith(e));
        return it.type === 'file' && looks;
      });

      const collected = [];
      for (const it of files){
        try{
          const base = it.name.replace(/\.[^.]+$/,'');
          let artist = '', title = base;
          const m = base.match(/^\s*([^-\u2014]{1,80})\s*[-\u2014]\s*(.+)$/);
          if (m){ artist = m[1].trim(); title = m[2].trim(); }

          const dl = await fetchJSON(API_BASE + '/resources/download?public_key=' + encodeURIComponent(PUBLIC_FOLDER_LINK) + '&path=' + encodeURIComponent(it.path));
          const playableUrl = PROXY + encodeURIComponent(dl.href);

          collected.push({ id: it.resource_id, title: title, artist: artist, url: playableUrl });
        }catch(e){ console.warn('Пропускаю файл:', it && it.name, e); }
      }

      tracks = collected;
      if (!tracks.length){ setTitleText('В папке нет доступных аудиофайлов'); return; }

      renderList();
      setTrack(0);
    }catch(e){
      console.error('Ошибка при загрузке списка треков:', e);
      setTitleText('Ошибка загрузки треков');
      nowArtist.textContent = 'Проверь публичную ссылку или воркер-прокси';
    }
  }

  function renderList(){
    listEl.innerHTML = '';
    tracks.forEach(function(t,i){
      var row = document.createElement('div');
      row.className = 'track'; row.dataset.index = i;
      row.innerHTML =
        '<div class="dot"></div>' +
        '<div style="min-width:0">' +
          '<div class="t-title">'+ (t.title || 'Без названия') +'</div>' +
          '<div class="t-artist">'+ (t.artist || '') +'</div>' +
        '</div>' +
        '<div class="t-time" id="t'+i+'"></div>';
      row.addEventListener('click', function(){ playIndex(i); });
      listEl.appendChild(row);
    });
    highlight();
  }

  function highlight(){ [].slice.call(listEl.children).forEach(function(e,i){ e.classList.toggle('active', i===current); }); }

  function setTrack(i){
    current = (i + tracks.length) % tracks.length;
    var t = tracks[current];
    audio.src = t.url;
    audio.load();
    setTitleText(t.title || 'Без названия');
    nowArtist.textContent = t.artist || '';
    highlight();
    updateTitleScroll();
  }

  function playIndex(i){ setTrack(i); audio.play().catch(function(err){ console.warn('play() blocked:', err); }); }

  // ====== audio events ======
  audio.addEventListener('loadedmetadata', function(){
    dur.textContent = fmtTime(audio.duration||0);
    updateTitleScroll();
  });
  audio.addEventListener('timeupdate', function(){
    cur.textContent = fmtTime(audio.currentTime);
    var r = (audio.currentTime||0) / (audio.duration||1);
    seek.value = Math.round(r * +seek.max); rangeBg(seek, r);
  });
  audio.addEventListener('play',  function(){
    playBtn.textContent = '⏸︎';
    updateTitleScroll();
  });
  audio.addEventListener('pause', function(){
    playBtn.textContent = '▶︎';
    nowTitle.classList.remove('scrolling'); // останавливаем бегущую строку на паузе
  });
  audio.addEventListener('ended', function(){ setTrack(current + 1); audio.play().catch(function(){}); });

  // ====== controls ======
  playBtn.onclick = async function(){
    if (!audio.src || audio.src === window.location.href) { if (!tracks.length) return; setTrack(current || 0); }
    try{ audio.paused ? await audio.play() : audio.pause(); } catch(e){ console.warn('Не удалось запустить воспроизведение:', e); }
  };
  prevBtn.onclick = function(){ playIndex(current - 1); };
  nextBtn.onclick = function(){ playIndex(current + 1); };
  muteBtn.onclick = function(){ audio.muted = !audio.muted; muteBtn.textContent = audio.muted ? '🔇' : '🔈'; };
  seek.oninput  = function(){ var r = +seek.value / +seek.max; rangeBg(seek, r); };
  seek.onchange = function(){ if (audio.duration) audio.currentTime = (+seek.value / +seek.max) * audio.duration; };
  audio.addEventListener('error', function(){ console.warn('AUDIO ERROR', audio.error && audio.error.code); });

  loadTracks();
})();
