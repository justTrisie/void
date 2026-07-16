// config keys
const BIN_ID = "6a59401ada38895dfe67f601";
const MASTER_KEY = "$2a$10$wS6gOXuHEuQzT2QF8EVLz.HIgCC.EzZaLOW36owzprYOUZT2o1ApS";
const IMGBB_API_KEY = "69adcfcc526fef2a3f2ff8dc5f1fde67";

const RAW_BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}?meta=false`;
const PROXIED_URL = 'https://corsproxy.io/?' + encodeURIComponent(RAW_BIN_URL);

// DOM References
const postForm = document.getElementById('post-form');
const fileInput = document.getElementById('post-file');
const fileTrigger = document.getElementById('file-trigger');
const fileNameSpan = document.getElementById('file-name');
const feedContainer = document.getElementById('feed');
const submitBtn = document.getElementById('submit-btn');

// route file upload trigger
fileTrigger.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  fileNameSpan.textContent = fileInput.files[0] ? fileInput.files[0].name.toUpperCase() : "NO_FILE_ATTACHED";
});

// helper to convert file to raw base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // strip out "data:image/png;base64," prefix for imgbb
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}

// 1. fetch stream from jsonbin (proxied to avoid cors)
async function getStream() {
  const response = await fetch(PROXIED_URL, {
    method: 'GET',
    headers: {
      'X-Master-Key': MASTER_KEY
    }
  });
  if (!response.ok) throw new Error('FETCH_STREAM_FAILED');
  const data = await response.json();
  return Array.isArray(data) ? data : (data.record || []);
}

// 2. update jsonbin stream with new array (proxied to avoid cors)
async function updateStream(newStream) {
  const response = await fetch(PROXIED_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': MASTER_KEY
    },
    body: JSON.stringify(newStream)
  });
  if (!response.ok) throw new Error('UPDATE_STREAM_FAILED');
  return await response.json();
}

// 3. upload file direct to imgbb (no proxy needed, native cors!)
async function uploadToImgBB(file) {
  const base64Data = await fileToBase64(file);
  
  const formData = new FormData();
  formData.append('image', base64Data);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ImgBB Error response:", errorText);
    throw new Error('IMGBB_UPLOAD_FAILED');
  }

  const result = await response.json();
  return result.data.url;
}

// 4. render posts array to feed interface
function renderFeed(posts) {
  feedContainer.innerHTML = '';
  
  if (!posts || posts.length === 0) {
    feedContainer.innerHTML = '<div class="system-message">VOID IS EMPTY // SEND FIRST TRANSMISSION</div>';
    return;
  }

  // sort posts newest first
  const sortedPosts = [...posts].sort((a, b) => b.timestamp - a.timestamp);

  sortedPosts.forEach(post => {
    const postDate = post.timestamp ? new Date(post.timestamp).toLocaleString('en-GB') : 'SYSTEM_TIME';
    
    const card = document.createElement('div');
    card.className = 'post-card';
    
    let mediaHtml = '';
    if (post.mediaUrl) {
      mediaHtml = `
        <div class="post-media-container">
          <img src="${post.mediaUrl}" class="post-media" alt="Transmission Media" loading="lazy">
        </div>
      `;
    }

    card.innerHTML = `
      <div class="post-header">
        <div>
          <span class="post-alias">${post.alias.toUpperCase()}</span>
          ${post.topic ? `<span class="post-topic">// ${post.topic.toUpperCase()}</span>` : ''}
        </div>
        <div>${postDate}</div>
      </div>
      <div class="post-body">
        ${escapeHtml(post.comment)}
      </div>
      ${mediaHtml}
    `;

    feedContainer.appendChild(card);
  });
}

// 5. form submission stream processor
postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const alias = document.getElementById('post-alias').value.trim() || 'ANONYMOUS';
  const topic = document.getElementById('post-topic').value.trim() || '';
  const comment = document.getElementById('post-body').value.trim();
  const file = fileInput.files[0];

  submitBtn.disabled = true;
  submitBtn.textContent = 'TRANSMITTING...';

  try {
    let fileUrl = '';
    if (file) {
      fileUrl = await uploadToImgBB(file);
    }

    // pull, append, and push update
    const currentStream = await getStream();
    
    const newPost = {
      alias,
      topic,
      comment,
      mediaUrl: fileUrl,
      timestamp: Date.now()
    };

    currentStream.push(newPost);
    await updateStream(currentStream);

    // instant local state sync
    renderFeed(currentStream);

    postForm.reset();
    fileNameSpan.textContent = "NO_FILE_ATTACHED";
  } catch (err) {
    console.error(err);
    alert('TRANSMISSION_ERROR: check developer console logs');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'SEND_TO_VOID';
  }
});

// quick protection utility against raw tag rendering
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// load active feed stream on script launch
getStream()
  .then(renderFeed)
  .catch(err => {
    console.error(err);
    feedContainer.innerHTML = '<div class="system-message">ERROR CONNECTING TO STREAM DATABASE</div>';
  });