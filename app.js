import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let motionAnimate = null;
let motionStagger = null;
let motionInView = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadMotion() {
    if (reducedMotion) return;
    try {
        const mod = await import("https://cdn.jsdelivr.net/npm/motion@11.15.0/+esm");
        motionAnimate = mod.animate;
        motionStagger = mod.stagger;
        motionInView = mod.inView;
    } catch (e) {
        console.warn("Motion.dev CDN unavailable, falling back to static transitions:", e);
    }
}

function runMotion(targets, keyframes, options = {}) {
    if (reducedMotion) return;
    const els = typeof targets === 'string'
        ? Array.from(document.querySelectorAll(targets))
        : (targets instanceof NodeList || Array.isArray(targets) ? Array.from(targets) : (targets ? [targets] : []));
    if (!els.length) return;

    const normalizedOptions = { ...options };
    if (normalizedOptions.easing && !normalizedOptions.ease) {
        normalizedOptions.ease = normalizedOptions.easing;
    }

    if (motionAnimate) {
        try {
            return motionAnimate(els, keyframes, normalizedOptions);
        } catch (e) {
            return runWaapiFallback(els, keyframes, normalizedOptions);
        }
    }
    return runWaapiFallback(els, keyframes, normalizedOptions);
}

function runWaapiFallback(els, keyframes, options = {}) {
    const durationMs = Math.round((options.duration || 0.65) * 1000);
    const baseDelay = typeof options.delay === 'number' ? options.delay : 0;
    const stepDelay = typeof options.staggerStep === 'number' ? options.staggerStep : 0;

    els.forEach((el, idx) => {
        if (!el || typeof el.animate !== 'function') return;
        const fromTransform = [];
        const toTransform = [];
        const fromFrame = {};
        const toFrame = {};

        if (keyframes.x) {
            fromTransform.push(`translateX(${typeof keyframes.x[0] === 'number' ? keyframes.x[0] + 'px' : keyframes.x[0]})`);
            toTransform.push(`translateX(${typeof keyframes.x[1] === 'number' ? keyframes.x[1] + 'px' : keyframes.x[1]})`);
        }
        if (keyframes.y) {
            fromTransform.push(`translateY(${typeof keyframes.y[0] === 'number' ? keyframes.y[0] + 'px' : keyframes.y[0]})`);
            toTransform.push(`translateY(${typeof keyframes.y[1] === 'number' ? keyframes.y[1] + 'px' : keyframes.y[1]})`);
        }
        if (keyframes.scale) {
            fromTransform.push(`scale(${keyframes.scale[0]})`);
            toTransform.push(`scale(${keyframes.scale[1]})`);
        }
        if (keyframes.rotate) {
            fromTransform.push(`rotate(${keyframes.rotate[0]}deg)`);
            toTransform.push(`rotate(${keyframes.rotate[1]}deg)`);
        }
        if (keyframes.rotateY) {
            fromTransform.unshift('perspective(1200px)');
            toTransform.unshift('perspective(1200px)');
            fromTransform.push(`rotateY(${keyframes.rotateY[0]}deg)`);
            toTransform.push(`rotateY(${keyframes.rotateY[1]}deg)`);
        }
        if (fromTransform.length) {
            fromFrame.transform = fromTransform.join(' ');
            toFrame.transform = toTransform.join(' ');
        }
        if (keyframes.opacity) {
            fromFrame.opacity = keyframes.opacity[0];
            toFrame.opacity = keyframes.opacity[1];
        }
        if (keyframes.filter) {
            fromFrame.filter = keyframes.filter[0];
            toFrame.filter = keyframes.filter[1];
        }
        if (keyframes.clipPath) {
            fromFrame.clipPath = keyframes.clipPath[0];
            toFrame.clipPath = keyframes.clipPath[1];
        }

        el.animate([fromFrame, toFrame], {
            duration: durationMs,
            delay: Math.round((baseDelay + idx * stepDelay) * 1000),
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both'
        });
    });
}

function observeEnter(el, onEnter) {
    if (!el || reducedMotion) {
        onEnter();
        return;
    }
    if (motionInView) {
        motionInView(el, () => { onEnter(); }, { amount: 0.08 });
        return;
    }
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    io.unobserve(el);
                    onEnter();
                }
            });
        }, { threshold: 0.08 });
        io.observe(el);
    } else {
        onEnter();
    }
}

const firebaseConfig = {
    apiKey: "AIzaSyCb_YzlwEWXMpCG1k6c4wcKPwuYvqAB74s",
    authDomain: "mireashanzaman-portfolio.firebaseapp.com",
    projectId: "mireashanzaman-portfolio",
    storageBucket: "mireashanzaman-portfolio.firebasestorage.app",
    messagingSenderId: "794227190129",
    appId: "1:794227190129:web:dfaed5a3c69046eac76ed0",
    measurementId: "G-CPP4LYL5RW"
};

let db = null, auth = null, storage = null;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
} catch (e) {
    console.warn("Firebase unavailable:", e);
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url) {
    const trimmed = String(url ?? '').trim();
    if (!trimmed || trimmed === '#') return '';
    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
    return 'https://' + trimmed;
}

let toastTimer = null;
function showToast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${esc(message)}</span>`;
    clearTimeout(toastTimer);
    if (motionAnimate && !reducedMotion) {
        runMotion(el, { opacity: [0, 1], y: [12, 0] }, { duration: 0.22, easing: [0.22, 1, 0.36, 1] });
    } else {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
    }
    toastTimer = setTimeout(() => {
        if (motionAnimate && !reducedMotion) {
            runMotion(el, { opacity: [1, 0], y: [0, 8] }, { duration: 0.18, easing: [0.22, 1, 0.36, 1] });
        } else {
            el.style.opacity = '0';
        }
    }, 2600);
}

const ICONS = {
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
    github: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`,
    download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>`,
    sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
    moon: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`
};

const ARCH_SPECS = [
    {
        spec: 'React 19 · TypeScript · Tailwind CSS · Vercel deployment',
        label: 'Live demo',
        href: 'https://oil-supply-and-delivery-management.vercel.app'
    },
    {
        spec: 'NestJS · Saga, Strategy, Observer & Facade patterns · Docker',
        label: 'Backend repo',
        href: 'https://github.com/MirEashanZaman/Oil-Supply-Delivery-Management-System-Backend'
    },
    {
        spec: 'PostgreSQL · TypeORM migrations · Pusher realtime channels',
        label: 'Frontend repo',
        href: 'https://github.com/MirEashanZaman/oil-supply-and-delivery-management-system-frontend'
    },
    {
        spec: 'Capacitor Android build · Offline-friendly e-POD & GPS tracking',
        label: 'Download APK',
        href: 'https://drive.google.com/file/d/17powG4Vv6PfM3D-qfFs0M61HPuJGXPQc/view?usp=drive_link'
    }
];

let archIndex = 0;
let archPaused = false;
let archTimer = null;
let archProgressAnim = null;

function restartArchProgress() {
    const bar = document.getElementById('arch-progress');
    if (!bar || reducedMotion) return;
    if (archProgressAnim && archProgressAnim.stop) archProgressAnim.stop();
    if (archPaused) {
        bar.style.transform = 'scaleX(0)';
        return;
    }
    if (motionAnimate) {
        archProgressAnim = motionAnimate(bar, { scaleX: [0, 1] }, { duration: 4.5, easing: 'linear' });
    }
}

window.selectArchNode = function (index, userTriggered = false) {
    archIndex = index;
    const nodes = document.querySelectorAll('.arch-node');
    nodes.forEach((node, i) => {
        const active = i === index;
        node.classList.toggle('selected', active);
        node.setAttribute('aria-selected', String(active));
    });
    const data = ARCH_SPECS[index] || ARCH_SPECS[0];
    const specEl = document.getElementById('arch-spec');
    const actionEl = document.getElementById('arch-action');
    if (specEl) specEl.textContent = data.spec;
    if (actionEl) {
        actionEl.href = data.href;
        actionEl.innerHTML = `${esc(data.label)} ${ICONS.arrow}`;
    }
    const inspector = document.getElementById('arch-inspector');
    if (inspector) {
        runMotion(inspector, { opacity: [0.35, 1], y: [6, 0] }, { duration: 0.26, easing: [0.22, 1, 0.36, 1] });
    }
    if (userTriggered) {
        resetArchCycle();
    } else {
        restartArchProgress();
    }
};

function resetArchCycle() {
    clearInterval(archTimer);
    if (reducedMotion) return;
    restartArchProgress();
    archTimer = setInterval(() => {
        if (archPaused || document.hidden) return;
        const homeActive = document.getElementById('page-home')?.classList.contains('active');
        if (!homeActive) return;
        selectArchNode((archIndex + 1) % ARCH_SPECS.length, false);
    }, 4500);
}

function initArchLivePanel() {
    const panel = document.getElementById('arch-panel');
    if (panel) {
        panel.addEventListener('pointerenter', () => {
            archPaused = true;
            restartArchProgress();
        });
        panel.addEventListener('pointerleave', () => {
            archPaused = false;
            resetArchCycle();
        });
    }
    resetArchCycle();

    const sparkPath = document.getElementById('spark-path');
    if (!sparkPath || reducedMotion) return;
    let phase = 0;
    function tickSpark() {
        if (!document.hidden && document.getElementById('page-home')?.classList.contains('active')) {
            phase += 0.11;
            const pts = [];
            for (let x = 0; x <= 38; x += 3.8) {
                const y = 7
                    + Math.sin(x * 0.28 + phase) * 3.2
                    + Math.cos(x * 0.14 - phase * 0.7) * 1.6;
                pts.push(`${x === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
            }
            sparkPath.setAttribute('d', pts.join(' '));
        }
        requestAnimationFrame(tickSpark);
    }
    requestAnimationFrame(tickSpark);
}

const DEFAULT_PROJECTS = [
    {
        id: 'p_oil_fe',
        cat: 'enterprise',
        name: 'Oil Supply & Delivery Platform (Frontend)',
        desc: 'Next.js 16 + React 19 + TypeScript enterprise web app with real-time GPS telematics, live dispatch radar, automated tax invoicing (ISO 9001/BOL), e-POD signature verification, and Pusher WebSockets.',
        stack: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS', 'Pusher', 'Capacitor'],
        link: 'https://oil-supply-and-delivery-management.vercel.app',
        gh: 'https://github.com/MirEashanZaman/oil-supply-and-delivery-management-system-frontend',
        apk: 'https://drive.google.com/file/d/17powG4Vv6PfM3D-qfFs0M61HPuJGXPQc/view?usp=drive_link'
    },
    {
        id: 'p_oil_be',
        cat: 'enterprise',
        name: 'Oil Supply & Delivery ERP (Backend API)',
        desc: 'Distributed enterprise REST backend designed with NestJS, PostgreSQL & TypeORM. Implements Saga Orchestration, Strategy, Observer, Facade design patterns, token-bucket rate limiting, and automated test suites.',
        stack: ['NestJS', 'PostgreSQL', 'TypeORM', 'TypeScript', 'Docker', 'Design Patterns'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Oil-Supply-Delivery-Management-System-Backend'
    },
    {
        id: 'p_pharma',
        cat: 'enterprise',
        name: 'PharmaTrace (Supply-Chain Verification)',
        desc: 'NestJS & TypeScript supply-chain batch traceability system for pharmaceutical batch verification, counterfeit detection, audit trails, and inventory regulation.',
        stack: ['NestJS', 'TypeScript', 'PostgreSQL', 'TypeORM', 'REST API'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/pharma-trace'
    },
    {
        id: 'p_car',
        cat: 'management',
        name: 'Car Showroom Management System',
        desc: 'Desktop management system built in C# for automotive showrooms to manage car inventory, customer financing contracts, sales transactions, and reporting.',
        stack: ['C#', '.NET', 'SQL Server', 'Desktop UI'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Car-Showroom-Management-System'
    },
    {
        id: 'p_ap_dotnet',
        cat: 'management',
        name: 'AP-.NET Enterprise Demos & Core',
        desc: 'Advanced .NET enterprise application architecture repository with asynchronous pipelines, modular repository patterns, and business services.',
        stack: ['C#', '.NET Core', 'LINQ', 'Entity Framework'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/AP-.NET'
    },
    {
        id: 'p_blood',
        cat: 'management',
        name: 'Blood Bridge (Donor Matching Platform)',
        desc: 'Emergency blood donor connection system with geo-lookup, rapid recipient alerts, blood group inventory tracking, and request handling.',
        stack: ['PHP', 'MySQL', 'JavaScript', 'Bootstrap'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Blood_Bridge'
    },
    {
        id: 'p_hotel',
        cat: 'management',
        name: 'Hotel Management System',
        desc: 'Hospitality management web application managing dynamic room allocations, guest check-in/out workflows, invoice billing, and revenue analytics.',
        stack: ['PHP', 'MySQL', 'JavaScript', 'CSS3'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Hotel-Management-System'
    },
    {
        id: 'p_pharmacy_pos',
        cat: 'management',
        name: 'Pharmacy POS & Inventory System',
        desc: 'Full-featured pharmacy POS and inventory management platform tracking stock levels, drug expiration warnings, and prescription orders.',
        stack: ['PHP', 'MySQL', 'JavaScript', 'HTML5'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Pharmacy_Management_System'
    },
    {
        id: 'p_travel',
        cat: 'management',
        name: 'Travel Guide & Itinerary Planner',
        desc: 'Destination exploration and itinerary booking web app connecting tourists with certified local guides and custom trip schedules.',
        stack: ['PHP', 'MySQL', 'JavaScript', 'CSS3'],
        link: '',
        gh: 'https://github.com/MirEashanZaman/Travel-Guide'
    },
    {
        id: 'p_chess',
        cat: 'game',
        name: 'Chess Master (Interactive Engine)',
        desc: 'Full browser-based chess engine with move validation rules, legal move highlighting, check & checkmate detection, and state tracking.',
        stack: ['JavaScript', 'HTML5', 'CSS3', 'Game Logic'],
        link: 'https://chess-master-play.netlify.app/',
        gh: 'https://github.com/MirEashanZaman/Chess-Master'
    },
    {
        id: 'p_neon',
        cat: 'game',
        name: 'Neon Strike (Arcade Shooter)',
        desc: 'Fast-paced arcade shooter built on HTML5 Canvas API featuring dynamic particle effects, progressive difficulty, and responsive controls.',
        stack: ['HTML5 Canvas', 'Vanilla JS', 'Particle Physics'],
        link: 'https://neon-strike01.netlify.app/',
        gh: 'https://github.com/MirEashanZaman/Neon-Strike'
    },
    {
        id: 'p_snake',
        cat: 'game',
        name: 'Classic Retro Snake',
        desc: 'Retro arcade snake game with responsive keyboard/touch grid mechanics, smooth animation frame loop, and persistent high score tracking.',
        stack: ['JavaScript', 'HTML5 Canvas', 'Retro Audio'],
        link: 'https://snake-game-nostalgia.netlify.app/',
        gh: 'https://github.com/MirEashanZaman/Snake'
    },
    {
        id: 'p_sky',
        cat: 'game',
        name: 'Sky Dasher (Endless Runner)',
        desc: 'Dynamic endless runner game with procedural obstacle generation, physics-based jumping arcs, score milestones, and layered backgrounds.',
        stack: ['HTML5 Canvas', 'JavaScript', 'Game Physics'],
        link: 'https://sky-dasher.netlify.app/',
        gh: 'https://github.com/MirEashanZaman/sky-dasher'
    }
];

const DEFAULT_CERTS = [
    { id: 'c1', name: 'Software Engineering & Enterprise Architecture', issuer: 'AIUB', date: '2025', link: '#', lbl: 'AIUB' },
    { id: 'c2', name: 'Full-Stack Web Development & Modern JavaScript', issuer: 'Web Tech', date: '2025', link: '#', lbl: 'WBT' },
    { id: 'c3', name: 'Object-Oriented Programming in C# & .NET', issuer: 'AIUB', date: '2024', link: '#', lbl: '.NET' },
    { id: 'c4', name: 'Relational Database Design & Distributed Systems', issuer: 'RDBMS', date: '2024', link: '#', lbl: 'SQL' }
];

let editing = false;
let isAdmin = false;
let projects = [...DEFAULT_PROJECTS];
let photos = [];
let certs = [...DEFAULT_CERTS];
let pFilter = 'all';
let pQuery = '';
let heroAnimatedOnce = false;

function attachSpotlight(el) {
    if (!el || el.dataset.spotBound) return;
    el.dataset.spotBound = '1';
    el.addEventListener('pointermove', (e) => {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        el.style.setProperty('--mx', `${px}px`);
        el.style.setProperty('--my', `${py}px`);

        if (reducedMotion || window.innerWidth < 768) return;
        const nx = (px / rect.width - 0.5) * 2;
        const ny = (py / rect.height - 0.5) * 2;
        const rx = (-ny * 7.5).toFixed(2);
        const ry = (nx * 7.5).toFixed(2);
        el.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(12px)`;
    });
    el.addEventListener('pointerleave', () => {
        if (reducedMotion) return;
        if (motionAnimate) {
            runMotion(el, { transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg) translateZ(0px)' }, { duration: 0.45, ease: [0.22, 1, 0.36, 1] });
        } else {
            el.style.transform = '';
        }
    });
}

let scene3D = null;

function set3DPageCamera(page) {
    if (!scene3D) return;
    const presets = {
        home: { x: 0, y: 0.6, z: 9.2, coreX: 2.8, coreY: 0.4 },
        about: { x: -1.4, y: 1.0, z: 10.2, coreX: -3.2, coreY: 0.8 },
        portfolio: { x: 0.6, y: 1.5, z: 10.8, coreX: 3.4, coreY: -0.4 },
        photography: { x: -0.8, y: 0.3, z: 9.6, coreX: 0, coreY: 1.4 },
        resume: { x: 1.2, y: 0.9, z: 10.4, coreX: -2.8, coreY: -0.2 },
        contact: { x: 0, y: 0.5, z: 9.4, coreX: 2.6, coreY: 0.6 }
    };
    scene3D.target = presets[page] || presets.home;
}

function update3DTheme() {
    if (!scene3D) return;
    const isLight = document.body.classList.contains('light-mode');
    scene3D.applyTheme(isLight);
}

async function init3DScene() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas || reducedMotion) return;

    try {
        const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 0.6, 9.2);

        const coreGroup = new THREE.Group();
        coreGroup.position.set(2.8, 0.4, -1.5);
        scene.add(coreGroup);

        const outerGeo = new THREE.IcosahedronGeometry(1.75, 1);
        const outerWire = new THREE.WireframeGeometry(outerGeo);
        const outerMat = new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.32 });
        const outerMesh = new THREE.LineSegments(outerWire, outerMat);
        coreGroup.add(outerMesh);

        const innerGeo = new THREE.OctahedronGeometry(0.95, 0);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, wireframe: true, transparent: true, opacity: 0.48 });
        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        coreGroup.add(innerMesh);

        const ring1Geo = new THREE.TorusGeometry(2.55, 0.012, 8, 96);
        const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.28 });
        const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
        ring1.rotation.x = Math.PI * 0.38;
        ring1.rotation.y = Math.PI * 0.15;
        coreGroup.add(ring1);

        const ring2Geo = new THREE.TorusGeometry(3.15, 0.01, 8, 96);
        const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.22 });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = Math.PI * 0.62;
        ring2.rotation.y = -Math.PI * 0.22;
        coreGroup.add(ring2);

        const satGeo = new THREE.SphereGeometry(0.065, 12, 12);
        const satMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf });
        const sat1 = new THREE.Mesh(satGeo, satMat);
        const sat2 = new THREE.Mesh(satGeo, satMat);
        coreGroup.add(sat1, sat2);

        const gridGeo = new THREE.PlaneGeometry(36, 36, 36, 36);
        gridGeo.rotateX(-Math.PI / 2);
        const gridPos = gridGeo.attributes.position;
        const baseY = new Float32Array(gridPos.count);
        for (let i = 0; i < gridPos.count; i++) {
            baseY[i] = gridPos.getY(i);
        }
        const gridMat = new THREE.MeshBasicMaterial({ color: 0x64748b, wireframe: true, transparent: true, opacity: 0.12 });
        const terrain = new THREE.Mesh(gridGeo, gridMat);
        terrain.position.set(0, -3.6, -6);
        scene.add(terrain);

        const pCount = 260;
        const pPositions = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
            pPositions[i * 3] = (Math.random() - 0.5) * 28;
            pPositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
            pPositions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 4;
        }
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
        const pMat = new THREE.PointsMaterial({ color: 0x2dd4bf, size: 0.055, transparent: true, opacity: 0.45 });
        const particles = new THREE.Points(pGeo, pMat);
        scene.add(particles);

        const state = {
            target: { x: 0, y: 0.6, z: 9.2, coreX: 2.8, coreY: 0.4 },
            mx: 0,
            my: 0,
            applyTheme(isLight) {
                const accentHex = isLight ? 0x0f766e : 0x2dd4bf;
                const neutralHex = isLight ? 0x64748b : 0x94a3b8;
                outerMat.color.setHex(accentHex);
                outerMat.opacity = isLight ? 0.28 : 0.34;
                innerMat.color.setHex(accentHex);
                innerMat.opacity = isLight ? 0.38 : 0.48;
                ring1Mat.color.setHex(neutralHex);
                ring2Mat.color.setHex(accentHex);
                satMat.color.setHex(accentHex);
                gridMat.color.setHex(neutralHex);
                gridMat.opacity = isLight ? 0.14 : 0.11;
                pMat.color.setHex(accentHex);
                pMat.opacity = isLight ? 0.35 : 0.45;
            }
        };
        scene3D = state;
        state.applyTheme(document.body.classList.contains('light-mode'));

        window.addEventListener('pointermove', (e) => {
            state.mx = (e.clientX / window.innerWidth - 0.5) * 2;
            state.my = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight, false);
        });

        let clock = 0;
        function renderLoop() {
            requestAnimationFrame(renderLoop);
            if (document.hidden) return;
            clock += 0.012;

            outerMesh.rotation.y = clock * 0.35;
            outerMesh.rotation.x = Math.sin(clock * 0.25) * 0.35;
            innerMesh.rotation.y = -clock * 0.55;
            innerMesh.rotation.z = clock * 0.3;

            ring1.rotation.z = clock * 0.22;
            ring2.rotation.z = -clock * 0.18;

            sat1.position.set(Math.cos(clock * 1.1) * 2.55, Math.sin(clock * 1.1) * 0.9, Math.sin(clock * 1.1) * 2.2);
            sat2.position.set(Math.cos(-clock * 0.8 + 2) * 3.15, Math.sin(-clock * 0.8 + 2) * 1.4, Math.cos(-clock * 0.8 + 2) * 1.6);

            const scrollOffset = Math.min(window.scrollY / 600, 2.5);
            const t = state.target;
            coreGroup.position.x += (t.coreX - coreGroup.position.x) * 0.04;
            coreGroup.position.y += (t.coreY + Math.sin(clock * 0.8) * 0.22 - coreGroup.position.y) * 0.04;

            camera.position.x += (t.x + state.mx * 1.25 - camera.position.x) * 0.045;
            camera.position.y += (t.y - state.my * 0.75 - scrollOffset * 0.45 - camera.position.y) * 0.045;
            camera.position.z += (t.z + scrollOffset * 0.35 - camera.position.z) * 0.045;
            camera.lookAt(0, -scrollOffset * 0.2, -1.5);

            for (let i = 0; i < gridPos.count; i++) {
                const vx = gridPos.getX(i);
                const vz = gridPos.getZ(i);
                const wave = Math.sin(vx * 0.32 + clock * 1.1) * Math.cos(vz * 0.32 - clock * 0.8) * 0.45;
                gridPos.setY(i, baseY[i] + wave);
            }
            gridPos.needsUpdate = true;

            particles.rotation.y = clock * 0.035;
            renderer.render(scene, camera);
        }

        renderLoop();
    } catch (e) {
        console.warn("Three.js 3D unavailable, falling back to 2D mesh:", e);
        initAmbientMesh();
    }
}

function attachMagnetic(el) {
    if (!el || el.dataset.magBound || reducedMotion) return;
    el.dataset.magBound = '1';
    el.addEventListener('pointermove', (e) => {
        if (window.innerWidth < 768) return;
        const rect = el.getBoundingClientRect();
        const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.18;
        const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.22;
        el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    });
    el.addEventListener('pointerleave', () => {
        if (motionAnimate) {
            runMotion(el, { x: 0, y: 0 }, { type: 'spring', stiffness: 360, damping: 22 });
        } else {
            el.style.transform = '';
        }
    });
}

function initAmbientMesh() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;
    const spacing = 44;
    let mouseX = -999, mouseY = -999, targetX = -999, targetY = -999;
    let pulses = [];
    let t = 0;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnPulse() {
        const horiz = Math.random() > 0.45;
        const cols = Math.ceil(w / spacing);
        const rows = Math.ceil(h / spacing);
        const idx = horiz
            ? Math.floor(Math.random() * rows)
            : Math.floor(Math.random() * cols);
        return {
            horiz,
            line: idx * spacing + spacing * 0.5,
            pos: -80,
            speed: 1.4 + Math.random() * 1.8,
            len: 70 + Math.random() * 90,
            alpha: 0.25 + Math.random() * 0.35
        };
    }

    window.addEventListener('pointermove', (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
        targetX = -999;
        targetY = -999;
    });
    window.addEventListener('resize', resize);

    resize();
    pulses = Array.from({ length: 6 }, spawnPulse);

    function draw() {
        requestAnimationFrame(draw);
        if (document.hidden) return;

        t += 0.016;
        mouseX += (targetX - mouseX) * 0.08;
        mouseY += (targetY - mouseY) * 0.08;

        ctx.clearRect(0, 0, w, h);
        const isLight = document.body.classList.contains('light-mode');

        const gx = w * (0.68 + Math.sin(t * 0.28) * 0.08);
        const gy = h * (0.36 + Math.cos(t * 0.22) * 0.08);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.55);
        if (isLight) {
            grad.addColorStop(0, 'rgba(15, 118, 110, 0.065)');
            grad.addColorStop(0.5, 'rgba(15, 118, 110, 0.02)');
            grad.addColorStop(1, 'rgba(245, 247, 250, 0)');
        } else {
            grad.addColorStop(0, 'rgba(45, 212, 191, 0.085)');
            grad.addColorStop(0.48, 'rgba(56, 189, 248, 0.03)');
            grad.addColorStop(1, 'rgba(11, 13, 17, 0)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const baseColor = isLight ? [100, 110, 130] : [148, 163, 184];
        const accentColor = isLight ? [15, 118, 110] : [45, 212, 191];

        for (let y = spacing * 0.5; y < h; y += spacing) {
            for (let x = spacing * 0.5; x < w; x += spacing) {
                const wave = Math.sin(x * 0.008 + t * 0.9) * Math.cos(y * 0.008 - t * 0.65);
                let dx = x + wave * 3.5;
                let dy = y + Math.sin(x * 0.006 - t * 0.7) * 3.5;

                const distX = dx - mouseX;
                const distY = dy - mouseY;
                const dist = Math.hypot(distX, distY);
                const influence = dist < 170 ? (1 - dist / 170) : 0;

                if (influence > 0) {
                    const pull = influence * influence * 10;
                    dx -= (distX / (dist || 1)) * pull;
                    dy -= (distY / (dist || 1)) * pull;
                }

                const r = 1.05 + (wave + 1) * 0.25 + influence * 1.4;
                const alpha = (isLight ? 0.14 : 0.12) + (wave + 1) * 0.04 + influence * 0.55;

                if (influence > 0.15) {
                    ctx.fillStyle = `rgba(${accentColor[0]}, ${accentColor[1]}, ${accentColor[2]}, ${alpha.toFixed(3)})`;
                } else {
                    ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${alpha.toFixed(3)})`;
                }
                ctx.beginPath();
                ctx.arc(dx, dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < pulses.length; i++) {
            const p = pulses[i];
            p.pos += p.speed;
            const limit = p.horiz ? w + p.len : h + p.len;
            if (p.pos > limit) {
                pulses[i] = spawnPulse();
                continue;
            }
            const g = p.horiz
                ? ctx.createLinearGradient(p.pos - p.len, p.line, p.pos, p.line)
                : ctx.createLinearGradient(p.line, p.pos - p.len, p.line, p.pos);
            const a = isLight ? p.alpha * 0.7 : p.alpha;
            g.addColorStop(0, `rgba(${accentColor[0]}, ${accentColor[1]}, ${accentColor[2]}, 0)`);
            g.addColorStop(0.55, `rgba(${accentColor[0]}, ${accentColor[1]}, ${accentColor[2]}, ${a.toFixed(3)})`);
            g.addColorStop(1, `rgba(${accentColor[0]}, ${accentColor[1]}, ${accentColor[2]}, 0)`);
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            if (p.horiz) {
                ctx.moveTo(p.pos - p.len, p.line);
                ctx.lineTo(p.pos, p.line);
            } else {
                ctx.moveTo(p.line, p.pos - p.len);
                ctx.lineTo(p.line, p.pos);
            }
            ctx.stroke();
        }
    }

    requestAnimationFrame(draw);
}

function moveIndicator(containerId, indicatorId, activeEl, instant = false) {
    const container = document.getElementById(containerId);
    const indicator = document.getElementById(indicatorId);
    if (!container || !indicator || !activeEl) return;

    const cRect = container.getBoundingClientRect();
    const aRect = activeEl.getBoundingClientRect();
    if (aRect.width === 0) return;

    const x = aRect.left - cRect.left - 4;
    const y = aRect.top - cRect.top - 4;
    const w = aRect.width;
    const h = aRect.height;

    if (instant || !motionAnimate || reducedMotion) {
        indicator.style.opacity = '1';
        indicator.style.width = `${w}px`;
        indicator.style.height = `${h}px`;
        indicator.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        return;
    }

    runMotion(
        indicator,
        { opacity: 1, x, y, width: `${w}px`, height: `${h}px` },
        { type: 'spring', stiffness: 460, damping: 36, mass: 0.8 }
    );
}

if (auth) {
    onAuthStateChanged(auth, (user) => {
        isAdmin = !!user;
    });
}

async function handleLogin() {
    if (!auth) {
        showToast("Cloud authentication is unavailable");
        return;
    }
    const email = prompt("Admin email:");
    if (!email) return;
    const password = prompt("Password:");
    if (!password) return;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        isAdmin = true;
        showToast("Signed in to edit mode");
    } catch (e) {
        alert("Sign in failed: " + e.message);
        isAdmin = false;
    }
}

async function saveFieldToCloud(fieldId, value) {
    if (!isAdmin || !db) return;
    try {
        const docRef = doc(db, "portfolio", "content");
        await setDoc(docRef, { [fieldId]: value }, { merge: true });
    } catch (e) {
        console.error("Save error:", e);
    }
}

async function loadFieldsFromCloud() {
    if (!db) return;
    try {
        const docRef = doc(db, "portfolio", "content");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.querySelectorAll('[data-f]').forEach(el => {
                const fieldId = el.dataset.f;
                if (data[fieldId]) el.textContent = data[fieldId];
            });
            if (data.pf_pic) showProfilePic(data.pf_pic);
            if (data.cloud_proj) projects = JSON.parse(data.cloud_proj);
            if (data.cloud_certs) certs = JSON.parse(data.cloud_certs);
            if (data.cloud_cv) localStorage.setItem('pf_cv', data.cloud_cv);
            if (data.cloud_photos) photos = JSON.parse(data.cloud_photos);
            if (data.s_gh) localStorage.setItem('s_gh', data.s_gh);
            if (data.s_li) localStorage.setItem('s_li', data.s_li);
            if (data.s_em) localStorage.setItem('s_em', data.s_em);
        }
    } catch (e) {
        console.warn("Could not load cloud data, using defaults:", e);
    }
}

async function migrateLocalToCloud() {
    if (!isAdmin || !db) return;
    try {
        const localProj = localStorage.getItem('pf_proj');
        if (localProj) {
            const cloudDoc = await getDoc(doc(db, "portfolio", "content"));
            if (!cloudDoc.exists() || !cloudDoc.data().cloud_proj) {
                await saveFieldToCloud('cloud_proj', localProj);
                projects = JSON.parse(localProj);
            }
        }
        const localCerts = localStorage.getItem('pf_certs');
        if (localCerts) {
            const cloudDoc = await getDoc(doc(db, "portfolio", "content"));
            if (!cloudDoc.exists() || !cloudDoc.data().cloud_certs) {
                await saveFieldToCloud('cloud_certs', localCerts);
                certs = JSON.parse(localCerts);
            }
        }
    } catch (e) {
        console.warn("Migration skipped:", e);
    }
}

function syncThemeUI() {
    const isLight = document.body.classList.contains('light-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = isLight ? ICONS.moon : ICONS.sun;
    const mobLbl = document.getElementById('mob-theme-lbl');
    if (mobLbl) mobLbl.textContent = isLight ? 'Dark mode' : 'Light mode';
}

window.toggleTheme = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    syncThemeUI();
    update3DTheme();
    showToast(isLight ? 'Switched to light mode' : 'Switched to dark mode');
};

window.toggleMob = () => {
    const mob = document.getElementById('mob');
    const btn = document.getElementById('hamburger');
    if (!mob) return;
    const open = mob.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', String(open));
};

function offscreenDist(mult = 0.72) {
    return Math.min(Math.round((window.innerWidth || 1200) * mult), 780);
}

function flyIn(targets, fromX, fromY, delayVal = 0, duration = 0.78, rotateDeg = 0, fromScale = 0.94) {
    const rotY = fromX === 0 ? 0 : (fromX < 0 ? 20 : -20);
    runMotion(
        targets,
        {
            opacity: [0, 1],
            x: [fromX, 0],
            y: [fromY, 0],
            scale: [fromScale, 1],
            rotate: [rotateDeg, 0],
            rotateY: [rotY, 0],
            filter: ['blur(12px)', 'blur(0px)']
        },
        { duration, delay: delayVal, ease: [0.16, 1, 0.3, 1] }
    );
}

function flyStagger(selector, fromX, fromY, startDelay = 0.08, step = 0.085, duration = 0.74, rotateDeg = 0) {
    const els = Array.from(document.querySelectorAll(selector));
    els.forEach((el, idx) => {
        flyIn(el, fromX, fromY, startDelay + idx * step, duration, rotateDeg, 0.94);
    });
}

function animateCardsAlternating(selector) {
    if (reducedMotion) return;
    const dist = offscreenDist(0.68);
    const cards = Array.from(document.querySelectorAll(selector));
    cards.forEach((card, i) => {
        const fromLeft = card.classList.contains('featured') || i % 2 === 0;
        const fromX = fromLeft ? -dist : dist;
        const rot = fromLeft ? -3.5 : 3.5;
        if (i >= 4) {
            card.style.opacity = '0';
            observeEnter(card, () => {
                flyIn(card, fromX, 32, 0.04, 0.78, rot, 0.9);
            });
        } else {
            flyIn(card, fromX, 28, 0.08 + i * 0.09, 0.8, rot, 0.9);
        }
    });
}

function animatePhotosGallery() {
    if (reducedMotion) return;
    const dist = offscreenDist(0.75);
    const items = Array.from(document.querySelectorAll('#gal .gal-item'));
    items.forEach((item, i) => {
        const mod = i % 3;
        const fromX = mod === 0 ? -dist : (mod === 2 ? dist : 0);
        const fromY = mod === 1 ? 260 : 40;
        const rot = mod === 0 ? -6 : (mod === 2 ? 6 : 0);
        const trigger = () => {
            flyIn(item, fromX, fromY, i < 6 ? 0.08 + i * 0.09 : 0.04, 0.86, rot, 0.82);
        };
        if (i >= 6) {
            item.style.opacity = '0';
            observeEnter(item, trigger);
        } else {
            trigger();
        }
    });
}

function animatePageEntrance(page) {
    if (reducedMotion) return;
    const el = document.getElementById('page-' + page);
    if (!el) return;
    const dist = offscreenDist(0.72);

    if (page === 'home') {
        flyIn('#page-home .hero-meta', -dist, 0, 0.02, 0.68, -2, 0.95);
        flyStagger('#page-home .hero-word', -dist, 28, 0.08, 0.1, 0.82, -4);
        flyIn('#page-home .hero-sub', -dist, 16, 0.28, 0.8, -1.5, 0.96);
        flyIn('#page-home .hero-ctas', -dist * 0.85, 24, 0.38, 0.74, 0, 0.94);
        flyIn('#page-home .hero-facts', -dist * 0.75, 36, 0.46, 0.76, 0, 0.94);

        flyIn('#page-home .arch-panel', dist, 18, 0.16, 0.88, 3.5, 0.9);
        flyStagger('#page-home .arch-node', dist * 0.5, 0, 0.34, 0.085, 0.62, 1.5);

        if (!heroAnimatedOnce) {
            heroAnimatedOnce = true;
            animateStatCounters();
        }
        return;
    }

    flyIn(`#page-${page} .ph`, -dist, 0, 0.02, 0.72, -1.5, 0.96);

    if (page === 'about') {
        flyIn('#page-about .photo-col', -dist, 24, 0.08, 0.88, -5, 0.84);
        runMotion(
            '#pbox',
            { clipPath: ['inset(0 100% 0 0 round 16px)', 'inset(0 0% 0 0 round 16px)'], scale: [0.88, 1] },
            { duration: 0.92, delay: 0.12, ease: [0.16, 1, 0.3, 1] }
        );
        flyStagger('#page-about .about-bio p', dist, 16, 0.14, 0.1, 0.78, 1.5);
        flyIn('#page-about .cur-card', dist, 28, 0.36, 0.78, 2, 0.92);
        flyStagger('#page-about .stack-row', dist * 0.85, 16, 0.42, 0.09, 0.72, 1);
    } else if (page === 'portfolio') {
        flyIn('#page-portfolio .filter-bar', 0, -90, 0.06, 0.64, 0, 0.96);
        animateCardsAlternating('#proj-grid .proj-card');
    } else if (page === 'photography') {
        animatePhotosGallery();
    } else if (page === 'resume') {
        flyIn('#page-resume .cv-card', 0, -110, 0.08, 0.7, 0, 0.94);
        flyIn('#page-resume .res-grid > div:first-child', -dist, 20, 0.16, 0.82, -2.5, 0.92);
        flyIn('#page-resume .res-grid > div:last-child', dist, 20, 0.22, 0.82, 2.5, 0.92);
        animateCardsAlternating('#cert-grid .cert-card');
    } else if (page === 'contact') {
        flyStagger('#page-contact .con-card', -dist, 16, 0.1, 0.1, 0.78, -3);
        flyIn('#page-contact .cf', dist, 20, 0.18, 0.84, 3, 0.92);
    }
}

function animateStatCounters() {
    if (!motionAnimate || reducedMotion) return;
    ['stat-total', 'stat-ent', 'stat-games'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const target = parseInt(el.textContent, 10);
        if (isNaN(target)) return;
        motionAnimate(0, target, {
            duration: 0.7,
            easing: [0.22, 1, 0.36, 1],
            onUpdate: (latest) => { el.textContent = String(Math.round(latest)); }
        });
    });
}

window.go = function (page, instantIndicator = false) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('[data-p]').forEach(b => b.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    document.querySelectorAll('[data-p="' + page + '"]').forEach(b => b.classList.add('active'));
    window.scrollTo(0, 0);
    updateScrollBar();

    const mob = document.getElementById('mob');
    if (mob) mob.classList.remove('open');
    const btn = document.getElementById('hamburger');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    const activeNavBtn = document.querySelector(`#nav-links button[data-p="${page}"]`);
    moveIndicator('nav-links', 'nav-indicator', activeNavBtn, instantIndicator);

    if (page === 'portfolio') {
        const activeTab = document.querySelector('#filter-tabs .tab.on');
        requestAnimationFrame(() => moveIndicator('filter-tabs', 'tab-indicator', activeTab, true));
    }

    set3DPageCamera(page);
    animatePageEntrance(page);
};

window.toggleEdit = async function () {
    if (!isAdmin) {
        await handleLogin();
        if (!isAdmin) return;
    }
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    const epill = document.getElementById('epill');
    if (epill) epill.classList.toggle('show', editing);
    const lbl1 = document.getElementById('elbl');
    if (lbl1) lbl1.textContent = editing ? 'View mode' : 'Edit mode';
    const lbl2 = document.getElementById('elbl2');
    if (lbl2) lbl2.textContent = editing ? 'View mode' : 'Edit mode';
    document.querySelectorAll('.btn-edit').forEach(b => b.classList.toggle('on', editing));
    document.querySelectorAll('[data-f]').forEach(el => {
        el.contentEditable = editing ? 'true' : 'false';
    });
    document.getElementById('soc-edit').style.display = editing ? 'flex' : 'none';
    document.getElementById('con-edit').style.display = editing ? 'flex' : 'none';
    renderProjects();
    renderPhotos();
    renderCerts();
    renderCV();
};

function initEditableFields() {
    document.querySelectorAll('[data-f]').forEach(el => {
        el.addEventListener('blur', () => {
            if (editing) {
                saveFieldToCloud(el.dataset.f, el.textContent);
                showToast("Saved changes");
            }
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                el.blur();
            }
        });
    });
}

window.handleCV = async function (e) {
    const f = e.target.files[0];
    if (!f || f.type !== 'application/pdf') {
        showToast("Please upload a PDF file");
        return;
    }
    const r = new FileReader();
    r.onload = async ev => {
        const base64 = ev.target.result;
        await saveFieldToCloud('cloud_cv', base64);
        localStorage.setItem('pf_cv', base64);
        renderCV();
        showToast("Resume PDF updated");
    };
    r.readAsDataURL(f);
};

function renderCV() {
    const area = document.getElementById('cv-act');
    if (!area) return;
    const cv = localStorage.getItem('pf_cv');
    if (editing) {
        area.innerHTML = `<button type="button" class="btn btn-o btn-s" onclick="document.getElementById('cv-up').click()">Upload PDF</button>`;
    } else if (cv) {
        area.innerHTML = `<a href="${cv}" download="Mir-Eashan-Zaman-Resume.pdf" class="btn btn-p btn-s">Download PDF</a>`;
    } else {
        area.innerHTML = `<button type="button" class="btn btn-o btn-s" disabled>No PDF uploaded</button>`;
    }
}

async function persistLinks(gh, li, em) {
    if (gh) localStorage.setItem('s_gh', gh);
    if (li) localStorage.setItem('s_li', li);
    if (em) localStorage.setItem('s_em', em);
    await saveFieldToCloud('s_gh', gh);
    await saveFieldToCloud('s_li', li);
    await saveFieldToCloud('s_em', em);
    loadSocials();
    loadContactLinks();
    showToast("Contact links saved");
}

window.saveSocials = function () {
    persistLinks(
        document.getElementById('in-gh').value.trim(),
        document.getElementById('in-li').value.trim(),
        document.getElementById('in-em').value.trim()
    );
};

window.saveContactLinks = function () {
    persistLinks(
        document.getElementById('cein-gh').value.trim(),
        document.getElementById('cein-li').value.trim(),
        document.getElementById('cein-em').value.trim()
    );
};

function getLinks() {
    const gh = localStorage.getItem('s_gh') || 'https://github.com/MirEashanZaman';
    const li = localStorage.getItem('s_li') || 'https://linkedin.com/in/mir-eashan-zaman-319474343';
    const em = (localStorage.getItem('s_em') || 'mireashanzaman@gmail.com').replace(/^mailto:/i, '');
    return { gh, li, em };
}

function loadSocials() {
    const { gh, li, em } = getLinks();
    document.getElementById('sgh').href = safeUrl(gh);
    document.getElementById('sli').href = safeUrl(li);
    document.getElementById('sem').href = 'mailto:' + em;
    document.getElementById('in-gh').value = gh;
    document.getElementById('in-li').value = li;
    document.getElementById('in-em').value = em;
}

function loadContactLinks() {
    const { gh, li, em } = getLinks();
    const cgh = document.getElementById('cgh');
    if (cgh) { cgh.href = safeUrl(gh); cgh.textContent = gh.replace(/^https?:\/\//i, ''); }
    const cli = document.getElementById('cli');
    if (cli) { cli.href = safeUrl(li); cli.textContent = li.replace(/^https?:\/\//i, ''); }
    const cem = document.getElementById('cem');
    if (cem) { cem.href = 'mailto:' + em; cem.textContent = em; }

    const ceGh = document.getElementById('cein-gh');
    const ceLi = document.getElementById('cein-li');
    const ceEm = document.getElementById('cein-em');
    if (ceGh) ceGh.value = gh;
    if (ceLi) ceLi.value = li;
    if (ceEm) ceEm.value = em;
}

window.copyEmail = async function () {
    const { em } = getLinks();
    try {
        await navigator.clipboard.writeText(em);
        showToast(`Copied ${em}`);
        const btn = document.getElementById('copy-email-btn');
        if (btn) {
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
        }
    } catch (e) {
        showToast(em);
    }
};

window.sendForm = function () {
    const name = document.getElementById('fn').value.trim();
    const email = document.getElementById('fe').value.trim();
    const msg = document.getElementById('fm').value.trim();

    if (!name || !email || !msg) {
        showToast('Please fill out all fields');
        return;
    }

    const { em } = getLinks();
    const subject = encodeURIComponent(`Portfolio inquiry from ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    window.location.href = `mailto:${em}?subject=${subject}&body=${body}`;

    const fok = document.getElementById('fok');
    if (fok) {
        fok.style.display = 'block';
        setTimeout(() => { fok.style.display = 'none'; }, 4000);
    }
    showToast('Email draft opened');
};

window.triggerPhotoUp = function () {
    if (editing) document.getElementById('pup').click();
};

window.handleProfilePic = async function (e) {
    const f = e.target.files[0];
    if (!f) return;
    const compressed = await compressImage(f);
    if (!compressed) return;
    await saveFieldToCloud('pf_pic', compressed);
    showProfilePic(compressed);
    showToast('Profile photo updated');
};

function showProfilePic(src) {
    const img = document.getElementById('pimg');
    img.src = src;
    img.classList.add('show');
    const ph = document.getElementById('pph');
    if (ph) ph.style.display = 'none';
}

function updateHeroStats(list) {
    const total = document.getElementById('stat-total');
    const ent = document.getElementById('stat-ent');
    const games = document.getElementById('stat-games');
    if (total) total.textContent = String(list.length);
    if (ent) ent.textContent = String(list.filter(p => p.cat === 'enterprise').length);
    if (games) games.textContent = String(list.filter(p => p.cat === 'game').length);
}

window.addProj = async function () {
    const name = prompt('Project name:');
    if (!name) return;
    const catChoice = prompt('Category:\n1 = Enterprise & full-stack\n2 = Management systems\n3 = Games & interactive\n(Enter 1, 2, or 3):', '1');
    let cat = 'enterprise';
    if (catChoice === '2' || catChoice?.toLowerCase().includes('man')) cat = 'management';
    else if (catChoice === '3' || catChoice?.toLowerCase().includes('gam')) cat = 'game';

    const desc = prompt('Short description:') || '';
    const stack = (prompt('Stack (comma separated):') || '').split(',').map(s => s.trim()).filter(Boolean);
    const link = prompt('Live demo URL (optional):') || '';
    const gh = prompt('GitHub repo URL (optional):') || '';
    const apk = prompt('Android APK URL (optional):') || '';

    projects.push({ id: 'p' + Date.now(), cat, name, desc, stack, link, gh, apk });
    await saveFieldToCloud('cloud_proj', JSON.stringify(projects));
    renderProjects(true);
    showToast('Project added');
};

window.delProj = async function (id) {
    if (!confirm('Delete this project?')) return;
    projects = projects.filter(p => p.id !== id);
    await saveFieldToCloud('cloud_proj', JSON.stringify(projects));
    renderProjects(true);
    showToast('Project removed');
};

function renderProjects(animateCards = false) {
    const g = document.getElementById('proj-grid');
    if (!g) return;
    g.innerHTML = '';

    const list = (projects && projects.length) ? projects : DEFAULT_PROJECTS;
    updateHeroStats(list);

    const q = pQuery.trim().toLowerCase();
    const filtered = list.filter(p => {
        const matchCat = pFilter === 'all' || p.cat === pFilter;
        if (!matchCat) return false;
        if (!q) return true;
        const haystack = `${p.name} ${p.desc} ${(p.stack || []).join(' ')}`.toLowerCase();
        return haystack.includes(q);
    });

    const countEl = document.getElementById('proj-count');
    if (countEl) {
        countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}`;
    }

    if (!filtered.length) {
        g.innerHTML = `<div class="proj-empty">No projects match "${esc(pQuery)}". Try another keyword or category.</div>`;
    }

    filtered.forEach((p, idx) => {
        const d = document.createElement('article');
        const isFeatured = !q && idx === 0 && (pFilter === 'all' || pFilter === 'enterprise') && p.id === 'p_oil_fe';
        d.className = isFeatured ? 'proj-card spotlight-card featured' : 'proj-card spotlight-card';

        let catLabel = 'Enterprise & full-stack';
        if (p.cat === 'game') catLabel = 'Game & interactive';
        else if (p.cat === 'management') catLabel = 'Management system';

        let actionBtns = '';
        const liveHref = safeUrl(p.link);
        const ghHref = safeUrl(p.gh);
        const apkHref = safeUrl(p.apk);

        if (liveHref) {
            actionBtns += `<a href="${esc(liveHref)}" target="_blank" rel="noopener noreferrer" class="proj-link primary">${ICONS.play}${p.cat === 'game' ? 'Play' : 'Live demo'}</a>`;
        }
        if (ghHref) {
            actionBtns += `<a href="${esc(ghHref)}" target="_blank" rel="noopener noreferrer" class="proj-link">${ICONS.github}GitHub</a>`;
        }
        if (apkHref) {
            actionBtns += `<a href="${esc(apkHref)}" target="_blank" rel="noopener noreferrer" class="proj-link">${ICONS.download}Android APK</a>`;
        }

        const indexNum = String(idx + 1).padStart(2, '0');
        const stackHtml = (p.stack || []).map(s => `<span class="stag">${esc(s)}</span>`).join('');

        d.innerHTML = `
            <div>
                <div class="proj-meta">
                    <span class="proj-cat">${esc(catLabel)}</span>
                    <span class="proj-idx">${indexNum}</span>
                </div>
                <h3 class="proj-name">${esc(p.name)}</h3>
                <p class="proj-desc">${esc(p.desc)}</p>
                <div class="proj-stack">${stackHtml}</div>
            </div>
            ${(actionBtns || editing) ? `<div class="proj-actions">${actionBtns}${editing ? `<button type="button" class="btn-d" style="margin-left:auto" onclick="delProj('${esc(p.id)}')">Delete</button>` : ''}</div>` : ''}
        `;
        attachSpotlight(d);
        g.appendChild(d);
    });

    if (editing) {
        const ac = document.createElement('button');
        ac.type = 'button';
        ac.className = 'add-card';
        ac.textContent = 'Add project';
        ac.onclick = addProj;
        g.appendChild(ac);
    }

    if (animateCards && motionAnimate && !reducedMotion) {
        runMotion(
            '#proj-grid .proj-card',
            { opacity: [0, 1], y: [8, 0] },
            { duration: 0.26, delay: motionStagger(0.03), easing: [0.22, 1, 0.36, 1] }
        );
    }
}

window.filterP = function (cat, btn) {
    pFilter = cat;
    document.querySelectorAll('#filter-tabs .tab').forEach(b => {
        b.classList.remove('on');
        b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('on');
    btn.setAttribute('aria-selected', 'true');
    moveIndicator('filter-tabs', 'tab-indicator', btn);
    renderProjects(true);
};

window.addCert = async function () {
    const name = prompt('Certification name:');
    if (!name) return;
    const issuer = prompt('Issuer:') || '';
    const date = prompt('Year:') || '';
    const link = prompt('Verification link (optional):') || '#';
    certs.push({ id: 'c' + Date.now(), name, issuer, date, link, lbl: issuer.slice(0, 4).toUpperCase() || 'CERT' });
    await saveFieldToCloud('cloud_certs', JSON.stringify(certs));
    renderCerts();
    showToast('Certification added');
};

window.delCert = async function (id) {
    if (!confirm('Remove this certification?')) return;
    certs = certs.filter(c => c.id !== id);
    await saveFieldToCloud('cloud_certs', JSON.stringify(certs));
    renderCerts();
    showToast('Certification removed');
};

function renderCerts() {
    const g = document.getElementById('cert-grid');
    if (!g) return;
    g.innerHTML = '';

    certs.forEach(c => {
        const el = document.createElement('div');
        el.className = 'cert-card';
        const badgeLbl = c.lbl || (c.issuer ? c.issuer[0] : 'C');
        const href = safeUrl(c.link);
        const titleHtml = href
            ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="cert-name">${esc(c.name)}</a>`
            : `<div class="cert-name">${esc(c.name)}</div>`;

        el.innerHTML = `
            <button type="button" class="cert-del" onclick="delCert('${esc(c.id)}'); event.stopPropagation()" aria-label="Remove certification">${ICONS.close}</button>
            <div class="cert-hd">
                <span class="cert-badge">${esc(badgeLbl)}</span>
                <span class="cert-date">${esc(c.date)}</span>
            </div>
            <div>
                ${titleHtml}
                <div class="cert-iss">${esc(c.issuer)}</div>
            </div>
        `;
        g.appendChild(el);
    });

    if (editing) {
        const ac = document.createElement('button');
        ac.type = 'button';
        ac.className = 'add-cert';
        ac.textContent = 'Add certification';
        ac.onclick = addCert;
        g.appendChild(ac);
    }
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("MEZ_Portfolio_DB", 1);
        request.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains("photos")) idb.createObjectStore("photos", { keyPath: "id" });
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getAllPhotosFromDB() {
    const idb = await openDB();
    return new Promise((resolve) => {
        const tx = idb.transaction("photos", "readonly");
        const request = tx.objectStore("photos").getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

window.rescuePhotos = async function () {
    if (!isAdmin) {
        showToast("Enable edit mode and sign in first");
        return;
    }
    try {
        const myLocalPhotos = await getAllPhotosFromDB();
        if (myLocalPhotos.length === 0) {
            showToast("No local photos found to rescue");
            return;
        }
        await saveFieldToCloud('cloud_photos', JSON.stringify(myLocalPhotos));
        photos = myLocalPhotos;
        renderPhotos();
        showToast(`Synced ${myLocalPhotos.length} photos to cloud storage`);
    } catch (e) {
        console.error("Rescue failed:", e);
        showToast("Sync failed — check console");
    }
};

async function compressImage(file) {
    let processedBlob = file;
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
        try {
            if (typeof heic2any === 'undefined') return null;
            const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 });
            processedBlob = Array.isArray(converted) ? converted[0] : converted;
        } catch (e) {
            return null;
        }
    }
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(processedBlob);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const MAX_SIZE = 1200;
                if (width > height) {
                    if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                } else {
                    if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
        };
    });
}

window.handlePics = async function (e) {
    const files = Array.from(e.target.files);
    if (!files.length || !storage) return;

    const uploadBtn = document.querySelector('.add-photo');
    if (uploadBtn) uploadBtn.textContent = 'Uploading...';

    try {
        for (const f of files) {
            const compressedSrc = await compressImage(f);
            if (!compressedSrc) continue;

            const id = 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const caption = prompt(`Caption for ${f.name}:`) || '';

            try {
                const storageRef = ref(storage, `portfolio-photos/${id}.jpg`);
                await uploadString(storageRef, compressedSrc, 'data_url');
                const publicUrl = await getDownloadURL(storageRef);
                photos.push({ id, src: publicUrl, caption });
            } catch (error) {
                console.error("Storage upload failed:", error);
                showToast("Upload failed — check Storage rules");
            }
        }
        await saveFieldToCloud('cloud_photos', JSON.stringify(photos));
        showToast('Photos uploaded');
    } finally {
        renderPhotos();
        e.target.value = '';
    }
};

function renderPhotos() {
    const g = document.getElementById('gal');
    if (!g) return;
    g.innerHTML = '';

    if (!photos.length) {
        g.innerHTML = `<div class="gal-empty"><h3>No photographs published yet</h3><p>Switch to edit mode to upload images</p></div>`;
    } else {
        photos.forEach((p, idx) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'gal-item spotlight-card';
            el.style.setProperty('--kb-delay', `${-(idx * 2.3).toFixed(1)}s`);
            el.onclick = () => openLB(p.src, p.caption);
            el.innerHTML = `
                <img src="${esc(p.src)}" alt="${esc(p.caption || 'Photograph')}" loading="lazy" />
                ${p.caption ? `<div class="gal-cap">${esc(p.caption)}</div>` : ''}
                <span class="gal-del" role="button" tabindex="0" aria-label="Delete photo" onclick="delPhoto('${esc(p.id)}'); event.stopPropagation()">${ICONS.close}</span>
            `;
            attachSpotlight(el);
            g.appendChild(el);
        });
    }

    if (editing) {
        const ap = document.createElement('button');
        ap.type = 'button';
        ap.className = 'add-photo';
        ap.onclick = () => document.getElementById('pic-up').click();
        ap.textContent = 'Add photos';
        g.appendChild(ap);
    }

    if (document.getElementById('page-photography')?.classList.contains('active')) {
        animatePhotosGallery();
    }
}

window.delPhoto = async function (id) {
    if (!confirm('Remove this photo?')) return;
    const targetPhoto = photos.find(p => p.id === id);
    if (targetPhoto && targetPhoto.src.includes('firebasestorage') && storage) {
        try {
            const storageRef = ref(storage, `portfolio-photos/${id}.jpg`);
            await deleteObject(storageRef);
        } catch (error) {
            console.warn("Could not delete from storage:", error);
        }
    }
    photos = photos.filter(p => p.id !== id);
    await saveFieldToCloud('cloud_photos', JSON.stringify(photos));
    renderPhotos();
    showToast('Photo removed');
};

window.openLB = function (src, cap) {
    const lb = document.getElementById('lb');
    const img = document.getElementById('lb-img');
    img.src = src;
    img.alt = cap || 'Photograph preview';
    document.getElementById('lb-cap').textContent = cap || '';
    lb.classList.add('open');
    runMotion(img, { opacity: [0, 1], scale: [0.96, 1] }, { duration: 0.22, easing: [0.22, 1, 0.36, 1] });
};

window.closeLB = function (e) {
    if (e && e.target && e.target.id === 'lb-img') return;
    document.getElementById('lb').classList.remove('open');
};

let cmdSelected = 0;
let cmdItems = [];

function buildCmdItems(query) {
    const q = (query || '').trim().toLowerCase();
    const navEntries = [
        { group: 'Navigate', title: 'Home', meta: 'Page', run: () => go('home') },
        { group: 'Navigate', title: 'About', meta: 'Page', run: () => go('about') },
        { group: 'Navigate', title: 'Projects', meta: 'Page', run: () => go('portfolio') },
        { group: 'Navigate', title: 'Photography', meta: 'Page', run: () => go('photography') },
        { group: 'Navigate', title: 'Resume & certifications', meta: 'Page', run: () => go('resume') },
        { group: 'Navigate', title: 'Contact', meta: 'Page', run: () => go('contact') }
    ];
    const actionEntries = [
        { group: 'Actions', title: 'Copy email address', meta: 'Clipboard', run: () => copyEmail() },
        { group: 'Actions', title: 'Switch color theme', meta: 'Appearance', run: () => toggleTheme() },
        { group: 'Actions', title: 'Open GitHub profile', meta: 'External', run: () => window.open(safeUrl(getLinks().gh), '_blank', 'noopener,noreferrer') }
    ];
    const list = (projects && projects.length) ? projects : DEFAULT_PROJECTS;
    const projEntries = list.map(p => ({
        group: 'Projects',
        title: p.name,
        meta: p.link ? 'Live demo' : 'GitHub',
        search: `${p.name} ${(p.stack || []).join(' ')}`.toLowerCase(),
        run: () => {
            const url = safeUrl(p.link) || safeUrl(p.gh);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
            else go('portfolio');
        }
    }));

    const all = [...navEntries, ...actionEntries, ...projEntries];
    if (!q) return all.slice(0, 12);
    return all.filter(item => (item.search || item.title.toLowerCase()).includes(q)).slice(0, 12);
}

function renderCmdList() {
    const listEl = document.getElementById('cmd-list');
    if (!listEl) return;
    const q = document.getElementById('cmd-input')?.value || '';
    cmdItems = buildCmdItems(q);
    cmdSelected = Math.min(cmdSelected, Math.max(0, cmdItems.length - 1));

    if (!cmdItems.length) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.875rem">No matching results</div>`;
        return;
    }

    let html = '';
    let lastGroup = '';
    cmdItems.forEach((item, idx) => {
        if (item.group !== lastGroup) {
            html += `<div class="cmd-group">${esc(item.group)}</div>`;
            lastGroup = item.group;
        }
        html += `<button type="button" class="cmd-item${idx === cmdSelected ? ' selected' : ''}" data-cmd-idx="${idx}" role="option" aria-selected="${idx === cmdSelected}">
            <span class="cmd-item-left"><span class="cmd-item-title">${esc(item.title)}</span></span>
            <span class="cmd-item-meta">${esc(item.meta)}</span>
        </button>`;
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('.cmd-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.cmdIdx);
            const target = cmdItems[idx];
            closeCmd();
            if (target) target.run();
        });
    });
}

window.openCmd = function () {
    const backdrop = document.getElementById('cmd-backdrop');
    const modal = document.getElementById('cmd-modal');
    const input = document.getElementById('cmd-input');
    if (!backdrop) return;
    backdrop.classList.add('open');
    cmdSelected = 0;
    if (input) {
        input.value = '';
        renderCmdList();
        setTimeout(() => input.focus(), 10);
    }
    runMotion(modal, { opacity: [0, 1], y: [-8, 0], scale: [0.98, 1] }, { duration: 0.18, easing: [0.22, 1, 0.36, 1] });
};

window.closeCmd = function () {
    const backdrop = document.getElementById('cmd-backdrop');
    if (backdrop) backdrop.classList.remove('open');
};

function updateScrollBar() {
    const bar = document.getElementById('scroll-bar');
    if (!bar) return;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    if (docH <= 40) {
        bar.classList.remove('visible');
        bar.style.transform = 'scaleX(0)';
        return;
    }
    const ratio = Math.min(1, Math.max(0, window.scrollY / docH));
    bar.classList.toggle('visible', window.scrollY > 12);
    bar.style.transform = `scaleX(${ratio})`;
}

window.addEventListener('scroll', updateScrollBar, { passive: true });
window.addEventListener('resize', () => {
    const activeNav = document.querySelector('#nav-links button.active');
    if (activeNav) moveIndicator('nav-links', 'nav-indicator', activeNav, true);
    const activeTab = document.querySelector('#filter-tabs .tab.on');
    if (activeTab) moveIndicator('filter-tabs', 'tab-indicator', activeTab, true);
});

window.addEventListener('keydown', (e) => {
    const cmdOpen = document.getElementById('cmd-backdrop')?.classList.contains('open');

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (cmdOpen) closeCmd();
        else openCmd();
        return;
    }

    if (cmdOpen) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeCmd();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            cmdSelected = (cmdSelected + 1) % Math.max(1, cmdItems.length);
            renderCmdList();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            cmdSelected = (cmdSelected - 1 + Math.max(1, cmdItems.length)) % Math.max(1, cmdItems.length);
            renderCmdList();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = cmdItems[cmdSelected];
            closeCmd();
            if (target) target.run();
        }
        return;
    }

    if (e.key === 'Escape') {
        document.getElementById('lb').classList.remove('open');
        const mob = document.getElementById('mob');
        if (mob && mob.classList.contains('open')) toggleMob();
    }
});

async function init() {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
    syncThemeUI();

    const kbdEl = document.getElementById('cmd-kbd');
    if (kbdEl && /Mac|iPhone|iPad/i.test(navigator.platform || '')) {
        kbdEl.textContent = '⌘K';
    }

    const searchInput = document.getElementById('proj-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            pQuery = e.target.value;
            renderProjects(false);
        });
    }
    const cmdInput = document.getElementById('cmd-input');
    if (cmdInput) {
        cmdInput.addEventListener('input', () => {
            cmdSelected = 0;
            renderCmdList();
        });
    }

    document.querySelectorAll('.spotlight-card, .photo-box, .cv-card, .con-card, .cf').forEach((el) => {
        el.classList.add('spotlight-card');
        attachSpotlight(el);
    });
    document.querySelectorAll('.magnetic-btn').forEach(attachMagnetic);

    init3DScene();

    initEditableFields();
    loadSocials();
    loadContactLinks();
    renderProjects(false);
    renderCerts();
    renderPhotos();
    renderCV();

    await loadMotion();
    flyIn('nav', 0, -72, 0, 0.68, 0, 1);
    go('home', true);
    initArchLivePanel();

    const footerEl = document.querySelector('footer');
    if (footerEl && !reducedMotion) {
        observeEnter(footerEl, () => flyIn(footerEl, 0, 60, 0.04, 0.65, 0, 0.98));
    }

    await loadFieldsFromCloud();
    await migrateLocalToCloud();
    loadSocials();
    loadContactLinks();
    renderProjects(false);
    renderCerts();
    renderPhotos();
    renderCV();
}

window.addEventListener('DOMContentLoaded', init);
