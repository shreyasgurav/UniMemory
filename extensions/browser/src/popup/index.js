/**
 * UniMemory - Popup Script (Supermemory-style)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const notAuthEl = document.getElementById('not-authenticated');
  const authEl = document.getElementById('authenticated');
  
  // Elements
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const saveCurrentPageBtn = document.getElementById('save-current-page-btn');
  const saveBtnText = document.getElementById('save-btn-text');
  const autoSaveToggle = document.getElementById('auto-save-toggle');
  const pageTitle = document.getElementById('page-title');
  const pageUrl = document.getElementById('page-url');
  const statusMessage = document.getElementById('status-message');
  const userAvatarSettings = document.getElementById('user-avatar-settings');
  const userNameSettings = document.getElementById('user-name-settings');
  const userEmailSettings = document.getElementById('user-email-settings');
  
  // Project selector elements
  const projectDropdownBtn = document.getElementById('project-dropdown-btn');
  const projectDropdownMenu = document.getElementById('project-dropdown-menu');
  const projectList = document.getElementById('project-list');
  const newProjectBtn = document.getElementById('new-project-btn');
  const selectedProjectIcon = document.getElementById('selected-project-icon');
  const selectedProjectName = document.getElementById('selected-project-name');
  
  // Project state
  let projects = [];
  let selectedProject = null;
  let projectsLoading = false;
  
  // AI chat platforms to detect
  const AI_CHAT_DOMAINS = [
    'chat.openai.com',
    'chatgpt.com',
    'claude.ai',
    'gemini.google.com',
    'bard.google.com',
    'poe.com',
    'perplexity.ai',
    'copilot.microsoft.com',
    'you.com'
  ];
  
  // Tab elements
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Current user
  let currentUser = null;
  
  // Check auth status with retry logic
  async function checkAuth(retryCount = 0) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      
      loadingEl.classList.add('hidden');
      
      if (response.authenticated && response.user) {
        currentUser = response.user;
        showAuthenticatedState(response.user);
        await loadCurrentPageInfo();
      } else {
        // If not authenticated and this is first check, wait a bit and retry once
        // This handles the case where session is being set from welcome page
        if (retryCount === 0) {
          setTimeout(() => checkAuth(1), 500);
        } else {
          showNotAuthenticatedState();
        }
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      loadingEl.classList.add('hidden');
      showNotAuthenticatedState();
    }
  }
  
  function showAuthenticatedState(user) {
    notAuthEl.classList.add('hidden');
    authEl.classList.remove('hidden');
    
    // Set user info in settings tab
    userNameSettings.textContent = user.display_name || user.email?.split('@')[0] || 'User';
    userEmailSettings.textContent = user.email || '';
    
    if (user.avatar_url) {
      userAvatarSettings.innerHTML = `<img src="${user.avatar_url}" alt="Avatar">`;
    } else {
      userAvatarSettings.textContent = (user.display_name || user.email || 'U').charAt(0).toUpperCase();
    }
    
    // Load settings and projects
    loadSettings();
    loadProjects();
  }
  
  // ============ Project Functions ============
  
  function setProjectsLoading(loading) {
    projectsLoading = loading;
    // Disable save button while projects are loading
    if (loading) {
      saveCurrentPageBtn.disabled = true;
      saveCurrentPageBtn.classList.add('loading');
      selectedProjectName.textContent = 'Loading...';
      selectedProjectIcon.textContent = '⏳';
    } else {
      saveCurrentPageBtn.disabled = false;
      saveCurrentPageBtn.classList.remove('loading');
    }
  }

  async function loadProjects() {
    setProjectsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PROJECTS' });
      
      if (response.error) {
        console.error('Failed to load projects:', response.error);
        setProjectsLoading(false);
        return;
      }
      
      projects = response.projects || [];
      
      // Find default project or use first one
      const defaultProject = projects.find(p => p.is_default) || projects[0];
      
      // Check if we have a saved project selection
      const stored = await chrome.storage.local.get('selectedProjectId');
      const storedProjectId = stored.selectedProjectId;
      
      if (storedProjectId) {
        const storedProject = projects.find(p => p.id === storedProjectId);
        if (storedProject) {
          selectProject(storedProject);
        } else if (defaultProject) {
          selectProject(defaultProject);
        }
      } else if (defaultProject) {
        selectProject(defaultProject);
      }
      
      renderProjectList();
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setProjectsLoading(false);
    }
  }
  
  function selectProject(project) {
    selectedProject = project;
    // Use folder icon for default project, otherwise use project's icon
    selectedProjectIcon.textContent = project.is_default ? '📁' : (project.icon || '📁');
    selectedProjectName.textContent = project.name;
    
    // Save selection
    chrome.storage.local.set({ selectedProjectId: project.id });
    
    // Update UI
    renderProjectList();
  }
  
  function renderProjectList() {
    projectList.innerHTML = '';
    
    projects.forEach(project => {
      const item = document.createElement('button');
      item.className = `project-dropdown-item${selectedProject?.id === project.id ? ' selected' : ''}`;
      item.innerHTML = `
        <span class="project-icon">${project.icon || '📁'}</span>
        <span class="project-name">${project.name}</span>
        <span class="project-count">${project.memory_count || 0}</span>
      `;
      item.addEventListener('click', () => {
        selectProject(project);
        closeProjectDropdown();
      });
      projectList.appendChild(item);
    });
  }
  
  function toggleProjectDropdown() {
    const isOpen = !projectDropdownMenu.classList.contains('hidden');
    if (isOpen) {
      closeProjectDropdown();
    } else {
      openProjectDropdown();
    }
  }
  
  function openProjectDropdown() {
    projectDropdownMenu.classList.remove('hidden');
    projectDropdownBtn.classList.add('open');
  }
  
  function closeProjectDropdown() {
    projectDropdownMenu.classList.add('hidden');
    projectDropdownBtn.classList.remove('open');
  }
  
  async function createProject(name) {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'CREATE_PROJECT',
        name: name
      });
      
      if (response.error) {
        showStatus('Failed to create project', 'error');
        return;
      }
      
      // Add to list and select
      projects.push(response.project);
      selectProject(response.project);
      renderProjectList();
      showStatus('Project created', 'success');
    } catch (error) {
      console.error('Failed to create project:', error);
      showStatus('Failed to create project', 'error');
    }
  }
  
  function showNewProjectModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3 class="modal-title">New Project</h3>
        <input type="text" class="modal-input" placeholder="Project name" id="new-project-input" autofocus>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" id="modal-cancel">Cancel</button>
          <button class="modal-btn modal-btn-create" id="modal-create">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#new-project-input');
    const cancelBtn = modal.querySelector('#modal-cancel');
    const createBtn = modal.querySelector('#modal-create');
    
    input.focus();
    
    const close = () => modal.remove();
    
    const create = async () => {
      const name = input.value.trim();
      if (name) {
        close();
        await createProject(name);
      }
    };
    
    cancelBtn.addEventListener('click', close);
    createBtn.addEventListener('click', create);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') create();
      if (e.key === 'Escape') close();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }
  
  function showNotAuthenticatedState() {
    notAuthEl.classList.remove('hidden');
    authEl.classList.add('hidden');
  }
  
  async function loadCurrentPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        pageTitle.textContent = tab.title || 'Current Page';
        pageUrl.textContent = tab.url || '';
        
        // Check if it's an AI chat page and update button text and icon
        const url = tab.url || '';
        const isAiChat = AI_CHAT_DOMAINS.some(domain => url.includes(domain));
        
        // Update text
        saveBtnText.textContent = isAiChat ? 'Save this Chat' : 'Save Current Page';
        
        // Toggle icons
        const iconDocument = document.getElementById('icon-document');
        const iconDocumentFold = document.getElementById('icon-document-fold');
        const iconChat = document.getElementById('icon-chat');
        
        if (isAiChat) {
          iconDocument.classList.add('hidden');
          iconDocumentFold.classList.add('hidden');
          iconChat.classList.remove('hidden');
        } else {
          iconDocument.classList.remove('hidden');
          iconDocumentFold.classList.remove('hidden');
          iconChat.classList.add('hidden');
        }
      }
    } catch (error) {
      console.error('Failed to load page info:', error);
    }
  }
  
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = response.settings;
      
      autoSaveToggle.checked = settings.autoSave || false;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  async function saveSettings() {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          autoSave: autoSaveToggle.checked
        }
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
  
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }
  
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update visible content
      tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
          content.classList.add('active');
        } else {
          content.classList.add('hidden');
          content.classList.remove('active');
        }
      });
    });
  });
  
  // Save current page
  saveCurrentPageBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', 'error');
        return;
      }
      
      // Close popup immediately
      window.close();
      
      // Send message to content script to save the page with project_id
      await chrome.tabs.sendMessage(tab.id, { 
        type: 'SAVE_CURRENT_PAGE',
        projectId: selectedProject?.id || null
      });
    } catch (error) {
      console.error('Failed to save page:', error);
      showStatus('Failed to save page', 'error');
    }
  });
  
  // Project dropdown events
  projectDropdownBtn.addEventListener('click', toggleProjectDropdown);
  newProjectBtn.addEventListener('click', () => {
    closeProjectDropdown();
    showNewProjectModal();
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!projectDropdownBtn.contains(e.target) && !projectDropdownMenu.contains(e.target)) {
      closeProjectDropdown();
    }
  });
  
  // Event listeners
  loginBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGIN' });
    window.close();
  });
  
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    showNotAuthenticatedState();
  });

  // Settings change handlers
  autoSaveToggle.addEventListener('change', saveSettings);
  
  // Initialize
  checkAuth();
});
