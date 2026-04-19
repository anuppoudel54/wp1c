let currentAuthMode = 'login';
let userToken = localStorage.getItem('wp1c_token');
let username = localStorage.getItem('wp1c_username');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (userToken) {
        showDashboard();
    } else {
        showAuth();
    }

    document.getElementById('logoutBtn').addEventListener('click', logout);
});

// UI View Switching
function showAuth() {
    document.getElementById('authView').classList.add('active');
    document.getElementById('authView').classList.remove('hidden');
    document.getElementById('dashboardView').classList.remove('active');
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('navbar').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authView').classList.remove('active');
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('dashboardView').classList.add('active');
    document.getElementById('dashboardView').classList.remove('hidden');
    document.getElementById('navbar').classList.remove('hidden');
    
    document.getElementById('usernameDisplay').textContent = `Hello, ${username}`;
    fetchContainers();
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    const tabs = document.querySelectorAll('.tab');
    tabs[0].classList.toggle('active', mode === 'login');
    tabs[1].classList.toggle('active', mode === 'register');
    
    document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Log In' : 'Register';
    document.getElementById('authError').classList.add('hidden');
}

// Authentication
async function handleAuth(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = document.getElementById('authSubmitBtn');
    const errDiv = document.getElementById('authError');
    
    btn.classList.add('loading');
    errDiv.classList.add('hidden');

    try {
        const endpoint = currentAuthMode === 'login' ? '/api/login' : '/api/register';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.message || 'Authentication failed');
        }

        if (currentAuthMode === 'login') {
            userToken = data.token;
            username = data.username;
            localStorage.setItem('wp1c_token', userToken);
            localStorage.setItem('wp1c_username', username);
            showDashboard();
        } else {
            // Auto switch to login after register
            switchAuthTab('login');
            errDiv.textContent = 'Registration successful. Please log in.';
            errDiv.classList.remove('hidden');
            errDiv.style.color = 'var(--success)';
            errDiv.style.background = 'rgba(16, 185, 129, 0.1)';
            errDiv.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        }
    } catch (err) {
        errDiv.textContent = err.message;
        errDiv.classList.remove('hidden');
        errDiv.style.color = 'var(--danger)';
        errDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        errDiv.style.borderColor = 'rgba(239, 68, 68, 0.2)';
    } finally {
        btn.classList.remove('loading');
    }
}

function logout() {
    userToken = null;
    username = null;
    localStorage.removeItem('wp1c_token');
    localStorage.removeItem('wp1c_username');
    showAuth();
}

let pollingTimeout = null;

// Containers
async function fetchContainers() {
    const grid = document.getElementById('containersGrid');
    
    // Only show loading text if grid is completely empty
    if (grid.innerHTML.trim() === '') {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Loading containers...</div>';
    }
    
    try {
        const res = await fetch('/api/my-containers', {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        if (res.status === 401 || res.status === 403) {
            logout();
            return;
        }
        
        const data = await res.json();
        renderContainers(data.containers);
        
        // Auto-refresh if any container is pending
        const hasPending = data.containers.some(c => c.container_id === 'pending');
        if (pollingTimeout) clearTimeout(pollingTimeout);
        
        if (hasPending) {
            pollingTimeout = setTimeout(fetchContainers, 5000);
        }
    } catch (err) {
        grid.innerHTML = `<div class="error-msg">Failed to load containers: ${err.message}</div>`;
    }
}

function renderContainers(containers) {
    const grid = document.getElementById('containersGrid');
    grid.innerHTML = '';
    
    if (!containers || containers.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; background: rgba(0,0,0,0.2); border-radius: 1rem;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom: 1rem;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                <h3 style="margin-bottom: 0.5rem">No containers yet</h3>
                <p style="color: var(--text-muted)">Create your first WordPress instance to get started.</p>
            </div>`;
        return;
    }
    
    containers.forEach(c => {
        const date = new Date(c.created_at).toLocaleDateString();
        const url = `http://${c.hostname}.wp.local`;
        
        const isPending = c.container_id === 'pending';
        const isFailed = c.container_id === 'failed';
        
        let statusBadge = '';
        const isRunning = c.status === 'running';
        const isStopped = c.status === 'exited' || c.status === 'created';
        
        if (isPending) {
            statusBadge = '<span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); color: var(--primary); padding: 0.2rem 0.5rem; border-radius: 1rem; margin-left: 0.5rem;">Creating...</span>';
        } else if (isFailed) {
            statusBadge = '<span style="font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); color: var(--danger); padding: 0.2rem 0.5rem; border-radius: 1rem; margin-left: 0.5rem;">Failed</span>';
        } else if (isRunning) {
            statusBadge = '<span style="font-size: 0.75rem; background: rgba(16, 185, 129, 0.2); color: var(--success); padding: 0.2rem 0.5rem; border-radius: 1rem; margin-left: 0.5rem;">Running</span>';
        } else if (isStopped) {
            statusBadge = '<span style="font-size: 0.75rem; background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 0.2rem 0.5rem; border-radius: 1rem; margin-left: 0.5rem;">Stopped</span>';
        }

        const card = document.createElement('div');
        card.className = 'container-card';
        card.innerHTML = `
            <div class="container-icon" style="${isFailed ? 'color: var(--danger); background: rgba(239, 68, 68, 0.1);' : ''}">
                ${isPending ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>' : 
                  isFailed ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>' :
                  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M12 2v20M5 5l14 14M19 5L5 19"/></svg>'}
            </div>
            <h3 style="display: flex; align-items: center;">${c.hostname}.wp.local ${statusBadge}</h3>
            <p>Created on ${date}</p>
            
            <div class="container-meta">
                <div class="meta-row">
                    <span class="meta-label">ID</span>
                    <span class="meta-val">${isPending ? 'pending' : isFailed ? 'N/A' : c.container_id.substring(0, 8) + '...'}</span>
                </div>
                ${c.wp_admin_password ? `
                <div class="meta-row" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
                    <span class="meta-label">WP Admin User</span>
                    <span class="meta-val" style="color: var(--primary);">admin</span>
                </div>
                <div class="meta-row" style="align-items: center;">
                    <span class="meta-label">WP Admin Pass</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="meta-val" style="font-family: monospace; color: var(--success);">${c.wp_admin_password}</span>
                        <button class="btn btn-secondary btn-sm" onclick="dismissPassword(${c.id})" title="Hide password permanently" style="padding: 0.1rem 0.4rem; font-size: 0.7rem;">Dismiss</button>
                    </div>
                </div>` : ''}
            </div>
            
            <div class="container-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${isPending ? 
                  `<span style="flex: 1; display:block; text-align:center; color: var(--text-muted); padding: 0.5rem;">Please wait...</span>` : 
                  isFailed ? 
                  `<span style="flex: 1; display:block; text-align:center; color: var(--text-muted); padding: 0.5rem;">Creation failed</span>
                   <button class="btn btn-secondary btn-sm" style="flex: 1; background: rgba(239, 68, 68, 0.1); color: var(--danger);" onclick="deleteContainer(${c.id})">Delete</button>` :
                  `${isRunning ? `<a style="flex: 1" href="${url}" target="_blank">Visit Site &rarr;</a>` : `<span style="flex: 1; display:block; text-align:center; color: var(--text-muted); padding: 0.5rem;">Site Offline</span>`}
                   ${isRunning ? 
                     `<button class="btn btn-secondary btn-sm" title="Stop Container" onclick="toggleContainerState(${c.id}, 'stop')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"></rect></svg>
                      </button>` : 
                     `<button class="btn btn-secondary btn-sm" title="Start Container" onclick="toggleContainerState(${c.id}, 'start')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </button>`
                   }
                   <button class="btn btn-secondary btn-sm" title="Delete Container" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);" onclick="deleteContainer(${c.id})">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                   </button>`
                }
            </div>
        `;
        grid.appendChild(card);
    });
}

// Modal handling
function openCreateModal() {
    document.getElementById('createModal').classList.add('active');
    document.getElementById('hostname').value = '';
    document.getElementById('createError').classList.add('hidden');
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
}

async function handleCreateContainer(e) {
    e.preventDefault();
    const hostname = document.getElementById('hostname').value;
    const btn = document.getElementById('createSubmitBtn');
    const errDiv = document.getElementById('createError');
    
    btn.classList.add('loading');
    errDiv.classList.add('hidden');
    
    try {
        const res = await fetch('/api/create-container', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ hostname })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.message || 'Failed to create container');
        }
        
        closeCreateModal();
        fetchContainers();
        
    } catch (err) {
        errDiv.textContent = err.message;
        errDiv.classList.remove('hidden');
    } finally {
        btn.classList.remove('loading');
    }
}

let containerToDelete = null;

function deleteContainer(id) {
    containerToDelete = id;
    document.getElementById('deleteModal').classList.add('active');
    document.getElementById('deleteError').classList.add('hidden');
}

function closeDeleteModal() {
    containerToDelete = null;
    document.getElementById('deleteModal').classList.remove('active');
}

async function executeDelete() {
    if (!containerToDelete) return;
    
    const id = containerToDelete;
    const btn = document.getElementById('deleteConfirmBtn');
    const errDiv = document.getElementById('deleteError');
    
    btn.classList.add('loading');
    btn.disabled = true;
    errDiv.classList.add('hidden');
    
    try {
        const res = await fetch(`/api/delete-container/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'Failed to delete container');
        }
        
        closeDeleteModal();
        fetchContainers();
    } catch (err) {
        errDiv.textContent = 'Error: ' + err.message;
        errDiv.classList.remove('hidden');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

async function toggleContainerState(id, action) {
    try {
        // Optimistically reload immediately to show loading state (if we implemented it) or just fetch
        const res = await fetch(`/api/${action}-container/${id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || `Failed to ${action} container`);
        }
        
        fetchContainers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function dismissPassword(id) {
    try {
        const res = await fetch(`/api/dismiss-password/${id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'Failed to dismiss password');
        }
        
        fetchContainers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
