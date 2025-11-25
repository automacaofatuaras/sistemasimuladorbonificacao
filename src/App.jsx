import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Users, FileText, Calculator, Moon, Sun, 
  Plus, Trash2, Edit, Save, X, Upload, FileSpreadsheet, 
  Printer, ChevronRight, ChevronLeft, Search, AlertCircle, CheckCircle,
  Database, AlertTriangle, Sparkles, Loader2, Globe, Building2, Wallet,
  Target, ClipboardCheck, BarChart3, Trophy, TrendingUp, TrendingDown,
  PieChart, Calendar, Filter, Lock, Unlock, LogOut, UserCog, KeyRound, ChevronDown,
  HardHat, Truck
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  writeBatch,
  setDoc,
  where
} from 'firebase/firestore';

// --- Configuração da API Gemini ---
const apiKey = ""; 

// --- DADOS PADRÃO (SEED) ---
const DEFAULT_ADMIN = {
  username: 'admin',
  password: '&mpresa00',
  role: 'admin',
  name: 'Administrador Geral'
};

const SEED_DATA = [
  { 
    companyCode: '62', companyName: 'SERRA GERAL ADMINIST. E PARTICIP. LTDA', externalId: '120001', name: 'ABNER LUIS SOARES DOS SANTOS', role: 'MOTORISTA CAMINHAO', team: 'EQ TERRAP 13 RICARDO II', 
    baseSalary: 3403.76, standardHours: 220, chargesPercent: 28.8, 
    provisions13: 365.00, provisionsVacation: 487.00, provisionsIndemnity: 170.00, provisionsTotal: 1022.00, notes: '' 
  },
  { 
    companyCode: '22', companyName: 'ENGENHARIA E MINERACAO AGUA VERMELHA LTD', externalId: '120002', name: 'ADEVILSON BERNARDO', role: 'AJUDANTE GERAL', team: 'EQ PAVIMENTAÇÃO 04 FABIO JOSE', 
    baseSalary: 2248.81, standardHours: 220, chargesPercent: 28.8, 
    provisions13: 241.00, provisionsVacation: 321.00, provisionsIndemnity: 112.00, provisionsTotal: 674.00, notes: '' 
  }
];

// --- TEMPLATES DE EQUIPES PROJETADAS ---
const TEAM_TEMPLATES = {
  'Pavimentação': [
    { role: 'AJUDANTE GERAL', count: 1 },
    { role: 'MOTORISTA CAMINHAO ESPARGIDOR', count: 1 },
    { role: 'MOTORISTA CAMINHAO', count: 1 },
    { role: 'OPERADOR DE ACABADORA', count: 1 },
    { role: 'OPERADOR DE ESPARGIDOR', count: 1 },
    { role: 'OPERADOR DE MESA', count: 1 },
    { role: 'OPERADOR DE ROLO', count: 1 },
    { role: 'RASTELEIRO', count: 2 },
    { role: 'ENC DE OBRAS PAVIMENTACAO', count: 1 }
  ],
  'Terraplenagem': [
    { role: 'AJUDANTE GERAL', count: 2 },
    { role: 'GREDISTA', count: 1 },
    { role: 'MOTORISTA CAMINHAO', count: 3 },
    { role: 'OPERADOR DE ESCAVADEIRA', count: 1 },
    { role: 'OPERADOR DE MAQUINAS', count: 3 },
    { role: 'OPERADOR DE PA CARREGADEIRA', count: 1 },
    { role: 'ENC DE OBRAS TERRAPLANAGEM', count: 1 }
  ]
};

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyAiyEyXHdDJLxC-kUuvVc7wyAgubZyFnyc",
  authDomain: "sistema-simulador-bonificacao.firebaseapp.com",
  projectId: "sistema-simulador-bonificacao",
  storageBucket: "sistema-simulador-bonificacao.firebasestorage.app",
  messagingSenderId: "251181063318",
  appId: "1:251181063318:web:af63d03a898bbb910276b7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore (app);
const auth = getAuth (app);
const appId = "projeto-simulador";

// --- Helper Gemini ---
async function callGemini(prompt, systemInstruction = "") {
  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erro na API Gemini');
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
}

// --- Componente Principal ---
export default function App() {
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [darkMode, setDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  const [employees, setEmployees] = useState([]);
  const [rules, setRules] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [currentSimulation, setCurrentSimulation] = useState(null);

  // --- Inicialização ---
  useEffect(() => {
    const initApp = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
      
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const q = query(usersRef, where('username', '==', 'admin'));
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(usersRef, DEFAULT_ADMIN);
      }
      setAuthLoading(false);
    };
    initApp();
  }, []);

  // --- Funções de Login/Logout ---
  const handleLogin = async (username, password) => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const q = query(usersRef, where('username', '==', username), where('password', '==', password));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
        setCurrentUser(userData);
        setIsAuthenticated(true);
        if (userData.role === 'avaliador') setCurrentView('evaluation'); else setCurrentView('dashboard');
        showNotification(`Bem-vindo, ${userData.name}!`);
        loadData(); 
      } else {
        showNotification('Usuário ou senha incorretos.', 'error');
      }
    } catch (error) { showNotification('Erro ao tentar login.', 'error'); } finally { setLoading(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null); setIsAuthenticated(false); setEmployees([]); setRules([]); setSimulations([]);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const empSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'employees'));
      const ruleSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'rules'));
      const simSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'simulations'), orderBy('createdAt', 'desc')));

      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRules(ruleSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSimulations(simSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { showNotification('Erro ao carregar dados', 'error'); } 
    finally { setLoading(false); }
  };

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  // --- Funções Auxiliares de Cálculo de Salário Médio ---
  const getAverageSalaryForRole = (role, allEmployees) => {
    // Normalização básica
    const normalizedRole = role.toUpperCase().trim();
    
    // Filtro exato
    let matches = allEmployees.filter(e => e.role && e.role.toUpperCase().includes(normalizedRole));
    
    // Se não achar exato, tenta por palavra chave (ex: "Motorista")
    if (matches.length === 0) {
      const keywords = normalizedRole.split(' ');
      if (keywords.length > 0) {
         matches = allEmployees.filter(e => e.role && e.role.toUpperCase().includes(keywords[0]));
      }
    }

    // Se ainda não achar, média geral da empresa
    if (matches.length === 0) matches = allEmployees;
    if (matches.length === 0) return { base: 2000, charges: 28.8, provisions: 600 }; // Fallback total

    const totalBase = matches.reduce((acc, e) => acc + (parseFloat(e.baseSalary) || 0), 0);
    const totalCharges = matches.reduce((acc, e) => acc + (parseFloat(e.chargesPercent) || 0), 0);
    const totalProv = matches.reduce((acc, e) => acc + (parseFloat(e.provisionsTotal) || 0), 0);
    
    return {
      base: totalBase / matches.length,
      charges: totalCharges / matches.length,
      provisions: totalProv / matches.length
    };
  };

  // --- Simulação Logic ---
  const generateSimulation = async (params) => {
    if (!currentUser) return;
    
    let allSimulationEmployees = [...employees];

    // Gerar Equipes Projetadas
    if (params.projectedTeams) {
      Object.entries(params.projectedTeams).forEach(([type, count]) => {
        if (count > 0) {
          const template = TEAM_TEMPLATES[type];
          for (let i = 1; i <= count; i++) {
             const teamName = `EQ. PROJETADA ${type.toUpperCase()} ${String(i).padStart(2, '0')}`;
             template.forEach(item => {
               const avgData = getAverageSalaryForRole(item.role, employees);
               for (let k = 0; k < item.count; k++) {
                 allSimulationEmployees.push({
                   id: `sim_${type}_${i}_${item.role}_${k}`,
                   companyCode: 'SIM', companyName: 'SIMULAÇÃO',
                   externalId: 'PROJ',
                   name: `[PROJEÇÃO] ${item.role} ${k+1}`,
                   role: item.role,
                   team: teamName,
                   baseSalary: avgData.base,
                   standardHours: 220,
                   chargesPercent: avgData.charges,
                   provisionsTotal: avgData.provisions,
                   notes: 'Funcionário Projetado',
                   isSimulated: true
                 });
               }
             });
          }
        }
      });
    }

    const details = allSimulationEmployees.map(emp => {
      let appliedRule = null;
      let bonusValue = 0;
      const individualRule = !emp.isSimulated ? rules.find(r => r.active && r.scope === 'Individual' && r.scopeValue === emp.id) : null;
      const roleRule = !individualRule ? rules.find(r => r.active && r.scope === 'Função' && r.scopeValue === emp.role) : null;
      const teamRule = !individualRule && !roleRule ? rules.find(r => r.active && r.scope === 'Equipe' && r.scopeValue === emp.team) : null;
      const globalRule = !individualRule && !roleRule && !teamRule ? rules.find(r => r.active && r.scope === 'Global') : null;
      appliedRule = individualRule || roleRule || teamRule || globalRule;

      if (appliedRule) {
        if (appliedRule.method === 'fixo') bonusValue = parseFloat(appliedRule.value);
        else bonusValue = emp.baseSalary * (parseFloat(appliedRule.value) / 100);
      } else {
        bonusValue = parseFloat(params.generalBonusValue);
      }
      
      const chargesValue = bonusValue * (emp.chargesPercent / 100);
      const provisionsValue = emp.provisionsTotal || 0;
      const totalCost = emp.baseSalary + bonusValue + chargesValue + provisionsValue;

      return {
        ...emp,
        bonusApplied: bonusValue,
        chargesValue: chargesValue,
        provisionsValue: provisionsValue,
        totalCost: totalCost,
        percentIncrease: emp.baseSalary > 0 ? (bonusValue / emp.baseSalary) * 100 : 0,
        ruleName: appliedRule ? (appliedRule.name || 'Regra Personalizada') : ''
      };
    });

    const baseTotal = details.reduce((acc, curr) => acc + curr.baseSalary + (curr.provisionsValue || 0), 0);
    const bonusTotal = details.reduce((acc, curr) => acc + curr.bonusApplied, 0);

    const simData = {
      name: params.name, type: 'Premiação', createdAt: new Date().toISOString(),
      baseTotal, bonusTotal, increaseVal: bonusTotal,
      increasePerc: baseTotal > 0 ? (bonusTotal / baseTotal) * 100 : 0,
      details: details,
      projectedTeams: params.projectedTeams
    };

    try {
      const ref = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'simulations'), { ...simData, createdAt: serverTimestamp() });
      const newSim = { ...simData, id: ref.id };
      setSimulations(prev => [newSim, ...prev]);
      setCurrentSimulation(newSim);
      setCurrentView('simulationDetail');
      showNotification('Simulação gerada com sucesso!');
    } catch (e) { showNotification('Erro ao gerar simulação', 'error'); }
  };
  
  // --- Lógica de Importação CSV ---
  const handleImportCSV = (content) => {
    const lines = content.split('\n');
    const newEmployees = [];
    const firstLine = lines[0] || '';
    const separator = firstLine.includes(';') ? ';' : ',';

    lines.forEach((line, idx) => {
      if (idx === 0) return; 
      if (!line.trim()) return;
      const cols = line.split(separator);
      if (cols.length < 5) return;

      const parseNum = (val) => {
         if (!val) return 0;
         let clean = val.replace(/[^0-9.,-]/g, '');
         if (clean.includes(',') && clean.includes('.')) { clean = clean.replace('.', '').replace(',', '.'); } 
         else if (clean.includes(',')) { clean = clean.replace(',', '.'); }
         return parseFloat(clean) || 0;
      };

      newEmployees.push({
        companyCode: cols[0]?.trim(), companyName: cols[1]?.trim(),
        externalId: cols[2]?.trim(), name: cols[3]?.trim(),
        role: cols[4]?.trim(), team: cols[5]?.trim(),
        baseSalary: parseNum(cols[6]), standardHours: parseInt(cols[7]) || 220,
        chargesPercent: parseNum(cols[8]),
        provisions13: parseNum(cols[9]), provisionsVacation: parseNum(cols[10]),
        provisionsIndemnity: parseNum(cols[11]), provisionsTotal: parseNum(cols[12]),
        notes: '', createdAt: new Date()
      });
    });

    let savedCount = 0;
    const savePromises = newEmployees.map(async (emp) => {
       try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), emp); savedCount++; } catch(e) {}
    });

    Promise.all(savePromises).then(() => {
        showNotification(`${savedCount} funcionários importados com sucesso.`);
        loadData(); 
    });
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40}/></div>;

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} loading={loading} notification={notification} />;
  }

  const canAccess = (view) => {
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'editor') return view !== 'users';
    if (currentUser.role === 'avaliador') return view === 'evaluation';
    return false;
  };

  return (
    <div className={`${darkMode ? 'dark' : ''} flex h-screen bg-gray-50 overflow-hidden font-sans print:h-auto print:overflow-visible`}>
       <style>{`@media print { body, html, #root { height: auto !important; overflow: visible !important; background: white !important; color: black !important; } .print\\:hidden { display: none !important; } .print\\:w-full { width: 100% !important; } .print\\:max-w-none { max-width: none !important; } ::-webkit-scrollbar { display: none; } }`}</style>

      {/* Confirmação Global */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-600 dark:text-slate-300 mb-4">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDialog({...confirmDialog, isOpen: false})} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded">Cancelar</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({...confirmDialog, isOpen: false}); }} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col shadow-lg z-20 transition-all duration-300 relative print:hidden`}>
        <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="absolute -right-3 top-9 bg-blue-600 text-white rounded-full p-1 shadow-md border border-slate-800 z-30 hover:bg-blue-700">
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div className={`p-6 border-b border-slate-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} overflow-hidden`}>
          <Calculator size={24} className="text-blue-400 shrink-0" />
          {!isSidebarCollapsed && <div><h1 className="text-xl font-bold text-blue-400">Bonificação</h1><p className="text-xs text-slate-400">Nível: {currentUser.role.toUpperCase()}</p></div>}
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {canAccess('dashboard') && <SidebarItem icon={LayoutDashboard} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} collapsed={isSidebarCollapsed} />}
          {canAccess('employees') && <SidebarItem icon={Users} label="Funcionários" active={currentView === 'employees'} onClick={() => setCurrentView('employees')} collapsed={isSidebarCollapsed} />}
          {canAccess('rules') && <SidebarItem icon={FileText} label="Regras Bonificação" active={currentView === 'rules'} onClick={() => setCurrentView('rules')} collapsed={isSidebarCollapsed} />}
          {canAccess('evaluation') && <SidebarItem icon={Target} label="Sistema de Avaliação" active={currentView === 'evaluation'} onClick={() => setCurrentView('evaluation')} collapsed={isSidebarCollapsed} />}
          {canAccess('simulations') && <SidebarItem icon={FileSpreadsheet} label="Simulações" active={['simulations', 'simulationDetail'].includes(currentView)} onClick={() => setCurrentView('simulations')} collapsed={isSidebarCollapsed} />}
          {canAccess('users') && <SidebarItem icon={UserCog} label="Usuários" active={currentView === 'users'} onClick={() => setCurrentView('users')} collapsed={isSidebarCollapsed} />}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => setDarkMode(!darkMode)} className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} text-slate-400 hover:text-white w-full p-2 rounded hover:bg-slate-800 transition-colors`}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            {!isSidebarCollapsed && <span>{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>}
          </button>
          <button onClick={handleLogout} className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} text-red-400 hover:text-white hover:bg-red-900/30 w-full p-2 rounded transition-colors`}>
            <LogOut size={20} />
            {!isSidebarCollapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 relative print:bg-white print:text-black">
        {notification && <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded shadow-lg text-white print:hidden flex items-center gap-2 animate-slide-in ${notification.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>{notification.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle size={18}/>} {notification.msg}</div>}
        
        <div className="p-8 max-w-7xl mx-auto print:p-0 print:w-full print:max-w-none">
          {loading ? <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600" size={40}/></div> : (
            <>
              {currentView === 'dashboard' && canAccess('dashboard') && <DashboardView employees={employees} rules={rules} simulations={simulations} navigateTo={setCurrentView} />}
              
              {currentView === 'employees' && canAccess('employees') && 
                <EmployeesView 
                  employees={employees} 
                  readOnly={currentUser.role === 'editor'}
                  onSave={async (data) => {
                    if(currentUser.role === 'editor') return;
                    const coll = collection(db, 'artifacts', appId, 'public', 'data', 'employees');
                    if(data.id) { await updateDoc(doc(coll, data.id), data); setEmployees(prev => prev.map(e => e.id === data.id ? data : e)); }
                    else { const ref = await addDoc(coll, data); setEmployees(prev => [...prev, {...data, id: ref.id}]); }
                    showNotification('Salvo!');
                  }} 
                  onDelete={(id) => {
                    if(currentUser.role === 'editor') return;
                    triggerConfirm('Excluir', 'Confirmar exclusão?', async () => {
                      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id));
                      setEmployees(prev => prev.filter(e => e.id !== id));
                      showNotification('Excluído.');
                    });
                  }}
                  onBulkDelete={(ids) => {
                    if(currentUser.role === 'editor') return;
                    triggerConfirm('Exclusão em Massa', `Excluir ${ids.length} itens?`, async () => {
                      await Promise.all(ids.map(id => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id))));
                      setEmployees(prev => prev.filter(e => !ids.includes(e.id)));
                      showNotification('Excluídos.');
                    });
                  }}
                  onImport={handleImportCSV}
                  onSeed={async () => {
                     if(currentUser.role === 'editor') return;
                     for (const emp of SEED_DATA) { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), { ...emp, createdAt: new Date() }); }
                     showNotification('Base carregada!');
                     loadData();
                  }}
                />
              }
              
              {currentView === 'rules' && canAccess('rules') &&
                <RulesView 
                  rules={rules} 
                  employees={employees} 
                  onSave={async (r) => {
                    const coll = collection(db, 'artifacts', appId, 'public', 'data', 'rules');
                    if(r.id) { await updateDoc(doc(coll, r.id), r); setRules(prev => prev.map(x => x.id === r.id ? r : x)); }
                    else { const ref = await addDoc(coll, r); setRules(prev => [...prev, {...r, id: ref.id}]); }
                    showNotification('Regra Salva');
                  }} 
                  onDelete={(id) => triggerConfirm('Excluir', 'Excluir regra?', async () => {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rules', id));
                    setRules(prev => prev.filter(x => x.id !== id));
                    showNotification('Regra excluída');
                  })} 
                />
              }
              
              {currentView === 'evaluation' && canAccess('evaluation') &&
                <EvaluationSystemView 
                  currentUser={currentUser}
                  employees={employees} 
                  appId={appId} 
                  db={db} 
                  showNotification={showNotification} 
                  triggerConfirm={triggerConfirm}
                />
              }
              
              {currentView === 'simulations' && canAccess('simulations') &&
                <SimulationsHistoryView 
                  simulations={simulations} 
                  onNewSimulation={generateSimulation} 
                  employees={employees} rules={rules} appId={appId} db={db} setSimulations={setSimulations}
                  showNotification={showNotification} 
                  onView={(sim) => { setCurrentSimulation(sim); setCurrentView('simulationDetail'); }} 
                  triggerConfirm={triggerConfirm}
                  onDelete={(id) => {
                     setSimulations(prev => prev.filter(s => s.id !== id));
                     showNotification('Simulação excluída.');
                  }}
                  onClearAll={() => {
                     setSimulations([]);
                     showNotification('Histórico limpo.');
                  }}
                />
              }

              {currentView === 'simulationDetail' && currentSimulation && canAccess('simulations') &&
                <SimulationDetailView 
                  simulation={currentSimulation} 
                  onBack={() => setCurrentView('simulations')} 
                />
              }

              {currentView === 'users' && canAccess('users') && 
                <UserManagementView 
                  appId={appId} 
                  db={db} 
                  showNotification={showNotification} 
                  triggerConfirm={triggerConfirm}
                />
              }
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ... (LoginScreen e UserManagementView mantidos idênticos) ...
function LoginScreen({ onLogin, loading, notification }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md animate-in fade-in zoom-in duration-300">
        <div className="flex justify-center mb-6"><div className="bg-blue-100 p-4 rounded-full"><Calculator size={40} className="text-blue-600" /></div></div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Bonificação</h2>
        <p className="text-center text-slate-500 mb-8 text-sm">Acesso Restrito ao Sistema</p>
        {notification && <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm flex items-center gap-2"><AlertCircle size={16} /> {notification.msg}</div>}
        <form onSubmit={(e) => { e.preventDefault(); onLogin(username, password); }}>
          <div className="space-y-4">
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-1">Usuário</label><input type="text" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={username} onChange={e => setUsername(e.target.value)} placeholder="Digite seu usuário" autoFocus/></div>
            <div><label className="block text-xs font-bold text-slate-600 uppercase mb-1">Senha</label><input type="password" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"/></div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg mt-4 flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin"/> : 'Entrar no Sistema'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserManagementView({ appId, db, showNotification, triggerConfirm }) {
  const [users, setUsers] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentUser, setCurrentUser] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchUsers();
  }, [appId, db]);

  const handleSave = async (u) => {
    if (!u.username || !u.password || !u.name) return showNotification('Preencha todos os campos.', 'error');
    try {
      const coll = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      if (u.id) { await updateDoc(doc(coll, u.id), u); setUsers(prev => prev.map(us => us.id === u.id ? u : us)); } 
      else { if (users.some(exist => exist.username === u.username)) return showNotification('Usuário já existe.', 'error'); const ref = await addDoc(coll, u); setUsers(prev => [...prev, { ...u, id: ref.id }]); }
      setIsEditing(false); showNotification('Usuário salvo.');
    } catch (e) { showNotification('Erro ao salvar.', 'error'); }
  };

  const handleDelete = (id, username) => {
    if (username === 'admin') return showNotification('O Admin principal não pode ser excluído.', 'error');
    triggerConfirm('Excluir Usuário', 'Tem certeza?', async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id));
      setUsers(prev => prev.filter(u => u.id !== id));
      showNotification('Usuário excluído.');
    });
  };

  const openEdit = (u = { username: '', password: '', role: 'avaliador', name: '' }) => { setCurrentUser(u); setIsEditing(true); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h2 className="text-2xl font-bold flex items-center gap-2"><UserCog size={24}/> Gestão de Usuários</h2><button onClick={() => openEdit()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"><Plus size={18}/> Novo Usuário</button></div>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 dark:bg-slate-700 text-xs uppercase"><tr><th className="p-4">Nome</th><th className="p-4">Usuário</th><th className="p-4">Nível</th><th className="p-4 text-center">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50"><td className="p-4 font-medium">{u.name}</td><td className="p-4 font-mono text-xs">{u.username}</td><td className="p-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'editor' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{u.role}</span></td><td className="p-4 flex justify-center gap-2"><button onClick={() => openEdit(u)} className="p-1 text-blue-600 rounded hover:bg-blue-50"><Edit size={16}/></button>{u.username !== 'admin' && <button onClick={() => handleDelete(u.id, u.username)} className="p-1 text-red-600 rounded hover:bg-red-50"><Trash2 size={16}/></button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">{currentUser.id ? 'Editar' : 'Novo'} Usuário</h3><button onClick={() => setIsEditing(false)}><X size={24}/></button></div>
            <form onSubmit={(e) => { e.preventDefault(); handleSave(currentUser); }} className="space-y-4">
              <div><label className="block text-xs font-bold mb-1">Nome Completo</label><input required className="w-full p-2 border rounded dark:bg-slate-700" value={currentUser.name} onChange={e => setCurrentUser({...currentUser, name: e.target.value})} /></div>
              <div><label className="block text-xs font-bold mb-1">Usuário (Login)</label><input required className="w-full p-2 border rounded dark:bg-slate-700" value={currentUser.username} onChange={e => setCurrentUser({...currentUser, username: e.target.value})} /></div>
              <div><label className="block text-xs font-bold mb-1">Senha</label><div className="relative"><input required type="text" className="w-full p-2 border rounded dark:bg-slate-700 pr-8" value={currentUser.password} onChange={e => setCurrentUser({...currentUser, password: e.target.value})} /><KeyRound size={16} className="absolute right-2 top-2.5 text-slate-400"/></div></div>
              <div>
                <label className="block text-xs font-bold mb-1">Nível de Acesso</label>
                <select className="w-full p-2 border rounded dark:bg-slate-700" value={currentUser.role} onChange={e => setCurrentUser({...currentUser, role: e.target.value})}>
                  <option value="avaliador">Avaliador</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end pt-4"><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded font-bold">Salvar Usuário</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Auxiliares ---
function SidebarItem({ icon: Icon, label, active, onClick, collapsed }) {
  return <button onClick={onClick} title={collapsed ? label : ''} className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} w-full p-3 rounded-lg transition-all ${active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon size={22} />{!collapsed && <span className="font-medium whitespace-nowrap overflow-hidden">{label}</span>}</button>;
}

function KPICard({ title, value, icon: Icon, color, onClick }) {
  return <div onClick={onClick} className={`bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}><div className={`${color} p-4 rounded-lg text-white shadow-lg`}><Icon size={24} /></div><div><p className="text-sm text-slate-500 dark:text-slate-400">{title}</p><p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p></div></div>;
}

function DashboardView({ employees, rules, simulations, navigateTo }) {
  const totalPayroll = employees.reduce((acc, curr) => acc + (parseFloat(curr.baseSalary) || 0) + (parseFloat(curr.provisionsTotal) || 0), 0);
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-6 print:hidden">Visão Geral</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <KPICard title="Funcionários" value={employees.length} icon={Users} color="bg-blue-500" onClick={() => navigateTo('employees')} />
        <KPICard title="Custo Folha (Base+Prov)" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPayroll)} icon={Calculator} color="bg-emerald-500" />
        <KPICard title="Regras Ativas" value={rules.filter(r => r.active).length} icon={FileText} color="bg-purple-500" onClick={() => navigateTo('rules')} />
      </div>
    </div>
  );
}

function EmployeesView({ employees, onSave, onDelete, onImport, onBulkDelete, onSeed, readOnly }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEmp, setCurrentEmp] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);

  const openEdit = (emp = {}) => {
    if (readOnly) return;
    setCurrentEmp(emp.id ? emp : { companyCode: '', companyName: '', externalId: '', name: '', role: '', team: '', baseSalary: 0, standardHours: 220, chargesPercent: 0, provisions13: 0, provisionsVacation: 0, provisionsIndemnity: 0, provisionsTotal: 0, notes: '' });
    setIsEditing(true);
  };

  const handleFileChange = (e) => {
    if (readOnly) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onImport(evt.target.result);
    reader.readAsText(file);
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = (e) => setSelectedIds(e.target.checked ? employees.map(e => e.id) : []);

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-4"><h2 className="text-2xl font-bold">Gerenciar Funcionários</h2>{selectedIds.length > 0 && !readOnly && <button onClick={() => { onBulkDelete(selectedIds); setSelectedIds([]); }} className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium hover:bg-red-200 transition-colors"><Trash2 size={14} /> Excluir {selectedIds.length} selecionados</button>}</div>
        {!readOnly && (
          <div className="flex gap-2">
             {employees.length === 0 && <button onClick={onSeed} className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded border border-amber-300"><Database size={18}/> Base</button>}
             <label className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded cursor-pointer hover:bg-emerald-700"><Upload size={18} /> Importar <input type="file" accept=".csv" className="hidden" onChange={handleFileChange} /></label>
             <button onClick={() => openEdit()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"><Plus size={18} /> Novo</button>
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 uppercase text-xs"><tr>{!readOnly && <th className="p-4 w-10"><input type="checkbox" onChange={toggleSelectAll} checked={employees.length > 0 && selectedIds.length === employees.length} className="cursor-pointer"/></th>}<th className="p-4">Empresa</th><th className="p-4">Nome</th><th className="p-4">Função</th><th className="p-4 text-right">Salário</th><th className="p-4 text-right">Encargos %</th><th className="p-4 text-right">Provisões</th><th className="p-4 text-right font-bold">Custo Total</th>{!readOnly && <th className="p-4 text-center">Ações</th>}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {employees.map(emp => {
                const totalBaseCost = (emp.baseSalary || 0) + (emp.provisionsTotal || 0) + ((emp.baseSalary * (emp.chargesPercent || 0)) / 100);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {!readOnly && <td className="p-4"><input type="checkbox" checked={selectedIds.includes(emp.id)} onChange={() => toggleSelect(emp.id)} className="cursor-pointer"/></td>}
                    <td className="p-4"><span className="text-xs font-semibold block truncate max-w-[120px]" title={emp.companyName}>{emp.companyName}</span><span className="text-[10px] text-slate-400">{emp.companyCode}</span></td>
                    <td className="p-4 font-medium"><div className="flex flex-col"><span>{emp.name}</span><span className="text-[10px] text-slate-400">ID: {emp.externalId}</span></div></td>
                    <td className="p-4"><div className="flex flex-col"><span className="text-xs">{emp.role}</span><span className="text-[10px] text-slate-400">{emp.team}</span></div></td>
                    <td className="p-4 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.baseSalary)}</td>
                    <td className="p-4 text-right">{emp.chargesPercent}%</td>
                    <td className="p-4 text-right text-xs text-slate-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.provisionsTotal)}</td>
                    <td className="p-4 text-right font-mono font-bold text-slate-700 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBaseCost)}</td>
                    {!readOnly && <td className="p-4 flex justify-center gap-2"><button onClick={() => openEdit(emp)} className="p-1 text-blue-600 hover:bg-blue-100 rounded"><Edit size={16}/></button><button onClick={() => onDelete(emp.id)} className="p-1 text-red-600 hover:bg-red-100 rounded"><Trash2 size={16}/></button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">Funcionário</h3><button onClick={() => setIsEditing(false)}><X size={24}/></button></div>
            <form onSubmit={(e) => { e.preventDefault(); onSave(currentEmp); setIsEditing(false); }} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold">Nome</label><input required className="w-full p-2 border rounded" value={currentEmp.name} onChange={e => setCurrentEmp({...currentEmp, name: e.target.value})}/></div>
                  <div><label className="text-xs font-bold">Função</label><input required className="w-full p-2 border rounded" value={currentEmp.role} onChange={e => setCurrentEmp({...currentEmp, role: e.target.value})}/></div>
                  <div><label className="text-xs font-bold">Salário</label><input required type="number" step="0.01" className="w-full p-2 border rounded" value={currentEmp.baseSalary} onChange={e => setCurrentEmp({...currentEmp, baseSalary: parseFloat(e.target.value)})}/></div>
                  <div><label className="text-xs font-bold">Equipe</label><input required className="w-full p-2 border rounded" value={currentEmp.team} onChange={e => setCurrentEmp({...currentEmp, team: e.target.value})}/></div>
                  <div><label className="text-xs font-bold">Encargos (%)</label><input type="number" step="0.1" className="w-full p-2 border rounded" value={currentEmp.chargesPercent} onChange={e => setCurrentEmp({...currentEmp, chargesPercent: parseFloat(e.target.value)})}/></div>
                  <div><label className="text-xs font-bold">Provisões Totais (R$)</label><input type="number" step="0.01" className="w-full p-2 border rounded" value={currentEmp.provisionsTotal} onChange={e => setCurrentEmp({...currentEmp, provisionsTotal: parseFloat(e.target.value)})}/></div>
               </div>
               <div className="flex justify-end pt-4"><button className="px-6 py-2 bg-blue-600 text-white rounded">Salvar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RulesView({ rules, employees, onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentRule, setCurrentRule] = useState({});
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const uniqueRoles = useMemo(() => [...new Set(employees.map(e => e.role))].sort(), [employees]);
  const uniqueTeams = useMemo(() => [...new Set(employees.map(e => e.team))].sort(), [employees]);

  const openEdit = (rule = {}) => {
    setCurrentRule(rule.id ? rule : { active: true, name: '', type: 'Premiação', scope: 'Individual', scopeValue: '', method: 'fixo', value: 0 });
    setIsEditing(true);
  };

  const handleAiCreate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    const context = `Tipos: Premiação, Hora Extra. Escopos: Individual, Função, Equipe, Global. Equipes: ${uniqueTeams.join(', ')}. Funções: ${uniqueRoles.join(', ')}.`;
    const prompt = `Crie JSON regra bonificação. Pedido: "${aiPrompt}". Campos: name, type, scope, scopeValue, method (fixo/percentual), value. Contexto: ${context}`;
    try {
      const result = await callGemini(prompt, "Retorne apenas JSON puro.");
      const ruleData = JSON.parse(result.replace(/```json|```/g, '').trim());
      setCurrentRule({ ...ruleData, active: true, value: parseFloat(ruleData.value) || 0 });
      setIsAiModalOpen(false); setIsEditing(true);
    } catch (e) { alert("Erro IA."); } finally { setIsAiLoading(false); setAiPrompt(''); }
  };

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Regras de Bonificação</h2>
        <div className="flex gap-2">
          <button onClick={() => setIsAiModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded animate-pulse"><Sparkles size={18} /> Assistente IA</button>
          <button onClick={() => openEdit()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded"><Plus size={18} /> Nova Regra</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rules.map(rule => (
          <div key={rule.id} className={`bg-white dark:bg-slate-800 p-5 rounded-lg shadow border-l-4 ${rule.active ? 'border-emerald-500' : 'border-slate-300'}`}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold truncate pr-2">{rule.name}</h3>
              <div className="flex gap-1">
                <button onClick={() => openEdit(rule)} className="text-slate-400 hover:text-blue-500"><Edit size={16}/></button>
                <button onClick={() => onDelete(rule.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="text-sm space-y-1 text-slate-600 dark:text-slate-300">
              <p><span className="font-semibold">Tipo:</span> {rule.type}</p>
              <p><span className="font-semibold">Escopo:</span> {rule.scope} {rule.scope !== 'Global' && `(${rule.scopeValue})`}</p>
              <p><span className="font-semibold">Valor:</span> {rule.method === 'fixo' ? `R$ ${rule.value}` : `${rule.value}%`}</p>
            </div>
          </div>
        ))}
      </div>
      
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-lg shadow-xl">
             <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">Regra</h3><button onClick={() => setIsEditing(false)}><X size={24}/></button></div>
             <form onSubmit={(e) => { e.preventDefault(); onSave(currentRule); setIsEditing(false); }} className="space-y-4">
               <div><label className="block text-xs font-bold">Nome</label><input required className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.name} onChange={e => setCurrentRule({...currentRule, name: e.target.value})}/></div>
               <div className="grid grid-cols-2 gap-4">
                 <div><label className="block text-xs font-bold">Tipo</label><select className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.type} onChange={e => setCurrentRule({...currentRule, type: e.target.value})}><option value="Premiação">Premiação</option><option value="Hora Extra">Hora Extra</option></select></div>
                 <div className="flex items-center mt-6"><input type="checkbox" checked={currentRule.active} onChange={e => setCurrentRule({...currentRule, active: e.target.checked})}/><label className="ml-2 text-sm">Ativa</label></div>
               </div>
               <div><label className="block text-xs font-bold">Escopo</label><select className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.scope} onChange={e => setCurrentRule({...currentRule, scope: e.target.value})}><option value="Global">Global</option><option value="Equipe">Equipe</option><option value="Função">Função</option><option value="Individual">Individual</option></select></div>
               {currentRule.scope !== 'Global' && (
                 <div><label className="block text-xs font-bold">Alvo</label><select className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.scopeValue} onChange={e => setCurrentRule({...currentRule, scopeValue: e.target.value})}><option value="">Selecione...</option>{currentRule.scope === 'Individual' ? employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>) : (currentRule.scope === 'Equipe' ? uniqueTeams : uniqueRoles).map(x => <option key={x} value={x}>{x}</option>)}</select></div>
               )}
               <div className="grid grid-cols-2 gap-4">
                 <div><label className="block text-xs font-bold">Método</label><select className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.method} onChange={e => setCurrentRule({...currentRule, method: e.target.value})}><option value="fixo">Fixo</option><option value="percentual">%</option></select></div>
                 <div><label className="block text-xs font-bold">Valor</label><input type="number" step="0.01" className="w-full p-2 border rounded dark:bg-slate-700" value={currentRule.value} onChange={e => setCurrentRule({...currentRule, value: parseFloat(e.target.value)})}/></div>
               </div>
               <div className="flex justify-end pt-4"><button className="px-6 py-2 bg-blue-600 text-white rounded">Salvar</button></div>
             </form>
          </div>
        </div>
      )}
      {isAiModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-purple-600"><Sparkles/> IA Criar Regra</h3>
            <textarea className="w-full p-3 border rounded dark:bg-slate-700 h-32 mb-4" placeholder="Ex: 10% para motoristas..." value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}/>
            <div className="flex justify-end gap-2"><button onClick={() => setIsAiModalOpen(false)} className="px-4 py-2 text-slate-600">Cancelar</button><button onClick={handleAiCreate} disabled={isAiLoading} className="px-6 py-2 bg-purple-600 text-white rounded">{isAiLoading ? <Loader2 className="animate-spin"/> : 'Gerar'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimulationsHistoryView({ simulations, onNewSimulation, onView, onDelete, onClearAll, employees, rules, appId, db, setSimulations, showNotification, triggerConfirm }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSimParams, setNewSimParams] = useState({ 
    name: '', 
    generalBonusValue: 0,
    projectedTeams: { 'Pavimentação': 0, 'Terraplenagem': 0 }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onNewSimulation(newSimParams);
    setIsModalOpen(false);
    setNewSimParams({ name: '', generalBonusValue: 0, projectedTeams: { 'Pavimentação': 0, 'Terraplenagem': 0 } });
  };

  const updateTeamCount = (type, delta) => {
    setNewSimParams(prev => ({
      ...prev,
      projectedTeams: {
        ...prev.projectedTeams,
        [type]: Math.max(0, (prev.projectedTeams[type] || 0) + delta)
      }
    }));
  };

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Simulações</h2>
        <div className="flex gap-2">
          {simulations.length > 0 && <button onClick={onClearAll} className="px-4 py-2 text-red-600 border border-red-200 rounded">Limpar</button>}
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded"><Calculator size={18} /> Nova Simulação</button>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 dark:bg-slate-700 uppercase text-xs"><tr><th className="p-4">Nome</th><th className="p-4">Data</th><th className="p-4 text-right">Custo Base (c/ Prov)</th><th className="p-4 text-right">Total Bônus</th><th className="p-4 text-center">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {simulations.map(sim => (
              <tr key={sim.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="p-4 font-medium">
                  {sim.name}
                  {sim.projectedTeams && Object.values(sim.projectedTeams).some(v => v > 0) && (
                     <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-full font-bold">PROJEÇÃO</span>
                  )}
                </td>
                <td className="p-4 text-slate-500">{new Date(sim.createdAt).toLocaleDateString()}</td>
                <td className="p-4 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.baseTotal)}</td>
                <td className="p-4 text-right font-mono text-emerald-600 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sim.bonusTotal)}</td>
                <td className="p-4 flex justify-center gap-2">
                  <button onClick={() => onView(sim)} className="p-1 text-blue-600 rounded"><FileText size={18}/></button>
                  <button onClick={() => onDelete(sim.id)} className="p-1 text-red-600 rounded"><Trash2 size={18}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold">Nova Simulação</h3>
               <button onClick={() => setIsModalOpen(false)}><X size={24}/></button>
             </div>
             <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold mb-1">Nome da Simulação</label><input required className="w-full p-2 border rounded dark:bg-slate-700" value={newSimParams.name} onChange={e => setNewSimParams({...newSimParams, name: e.target.value})} placeholder="Ex: Simulação Dezembro 2024" /></div>
                  <div><label className="block text-xs font-bold mb-1">Bônus Geral (R$)</label><input required type="number" className="w-full p-2 border rounded dark:bg-slate-700" value={newSimParams.generalBonusValue} onChange={e => setNewSimParams({...newSimParams, generalBonusValue: parseFloat(e.target.value)})} /></div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><HardHat size={16}/> Contratar Equipes (Projeção)</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded"><Truck size={18}/></div>
                        <div><p className="text-sm font-bold">Pavimentação</p><p className="text-xs text-slate-500">10 Pessoas</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button type="button" onClick={() => updateTeamCount('Pavimentação', -1)} className="p-1 bg-slate-200 rounded hover:bg-slate-300 w-8 h-8 flex items-center justify-center">-</button>
                         <span className="font-bold w-4 text-center">{newSimParams.projectedTeams['Pavimentação']}</span>
                         <button type="button" onClick={() => updateTeamCount('Pavimentação', 1)} className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 w-8 h-8 flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded"><Truck size={18}/></div>
                        <div><p className="text-sm font-bold">Terraplenagem</p><p className="text-xs text-slate-500">12 Pessoas</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button type="button" onClick={() => updateTeamCount('Terraplenagem', -1)} className="p-1 bg-slate-200 rounded hover:bg-slate-300 w-8 h-8 flex items-center justify-center">-</button>
                         <span className="font-bold w-4 text-center">{newSimParams.projectedTeams['Terraplenagem']}</span>
                         <button type="button" onClick={() => updateTeamCount('Terraplenagem', 1)} className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 w-8 h-8 flex items-center justify-center">+</button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3 italic">* Custo estimado baseado na média salarial da base atual.</p>
                </div>

                <div className="flex justify-end pt-4 gap-2"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600">Cancelar</button><button className="px-6 py-2 bg-emerald-600 text-white rounded font-bold shadow-lg hover:bg-emerald-700 transform transition-all active:scale-95">Gerar Simulação</button></div>
             </form>
           </div>
        </div>
      )}
    </div>
  );
}

function SimulationDetailView({ simulation, onBack }) {
  const teamSummary = useMemo(() => {
    const teams = {};
    simulation.details.forEach(d => {
      if (!teams[d.team]) teams[d.team] = { name: d.team, count: 0, baseTotal: 0, bonusTotal: 0 };
      teams[d.team].count++;
      teams[d.team].baseTotal += d.baseSalary + (d.provisionsValue || 0); // Base + Provisões
      teams[d.team].bonusTotal += d.bonusApplied;
    });
    return Object.values(teams).sort((a, b) => a.name.localeCompare(b.name));
  }, [simulation]);

  const sectorSummary = useMemo(() => {
    const sectors = {
      'Equipes de Terraplenagem': { count: 0, baseTotal: 0, bonusTotal: 0 },
      'Equipes de Pavimentação': { count: 0, baseTotal: 0, bonusTotal: 0 },
      'Equipe de Imprimação Base': { count: 0, baseTotal: 0, bonusTotal: 0 }
    };

    simulation.details.forEach(d => {
      const t = d.team ? d.team.toUpperCase() : '';
      let key = null;
      
      if (t.includes('TERRAP') || t.includes('TERRAPLENAGEM')) key = 'Equipes de Terraplenagem';
      else if (t.includes('PAVIMENT') || t.includes('PAVIMENTAÇÃO')) key = 'Equipes de Pavimentação';
      else if (t.includes('IMPRIM') || t.includes('BASE')) key = 'Equipe de Imprimação Base';

      if (key) {
        sectors[key].count++;
        sectors[key].baseTotal += d.baseSalary + (d.provisionsValue || 0);
        sectors[key].bonusTotal += d.bonusApplied;
      }
    });

    return Object.entries(sectors).map(([name, data]) => ({ name, ...data }));
  }, [simulation]);

  const handlePrint = () => { window.focus(); setTimeout(() => window.print(), 200); };

  const handleExport = () => {
    let csv = "Nome,Funcao,Equipe,Salario Base,Bonus,Encargos,Provisoes,Total Custo\n";
    simulation.details.forEach(d => csv += `"${d.name}","${d.role}","${d.team}",${d.baseSalary},${d.bonusApplied},${d.chargesValue},${d.provisionsValue || 0},${d.totalCost}\n`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `simulacao_${simulation.name}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-20 print:pb-0 print:w-full" id="simulation-print-area">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800"><ChevronRight className="rotate-180" /> Voltar</button>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border rounded hover:bg-slate-50"><FileSpreadsheet size={18} /> Excel</button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900"><Printer size={18} /> Exportar PDF</button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow border-t-4 border-blue-500 print:shadow-none print:border-none">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          {simulation.name}
          {simulation.projectedTeams && Object.values(simulation.projectedTeams).some(v => v > 0) && (
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full border border-indigo-200">COM PROJEÇÃO</span>
          )}
        </h1>
        <p className="text-slate-500 text-sm mb-6">Gerada em: {new Date(simulation.createdAt).toLocaleString()}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 print:grid-cols-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded border"><p className="text-xs font-bold uppercase">Folha Base (C/ Prov.)</p><p className="text-lg font-mono font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(simulation.baseTotal)}</p></div>
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded border"><p className="text-xs font-bold uppercase">Folha Final</p><p className="text-lg font-mono font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(simulation.baseTotal + simulation.bonusTotal + simulation.details.reduce((acc, d) => acc + d.chargesValue, 0))}</p></div>
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100"><p className="text-xs font-bold uppercase text-emerald-600">Total Bônus</p><p className="text-lg font-mono font-bold text-emerald-700">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(simulation.bonusTotal)}</p></div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100"><p className="text-xs font-bold uppercase text-blue-600">Aumento Médio</p><p className="text-lg font-mono font-bold text-blue-700">{simulation.increasePerc.toFixed(2)}%</p></div>
        </div>

        <h3 className="text-xl font-bold mb-4 border-b pb-2">Resumo por Setor</h3>
        <div className="overflow-x-auto mb-8 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Setor</th>
                <th className="p-3 text-center">Func.</th>
                <th className="p-3 text-right">Base (C/ Prov)</th>
                <th className="p-3 text-right">Bônus</th>
                <th className="p-3 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
              {sectorSummary.map(s => (
                <tr key={s.name}>
                  <td className="p-3 font-bold text-slate-700 dark:text-slate-200">{s.name}</td>
                  <td className="p-3 text-center">{s.count}</td>
                  <td className="p-3 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.baseTotal)}</td>
                  <td className="p-3 text-right font-mono text-emerald-600 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.bonusTotal)}</td>
                  <td className="p-3 text-right font-mono">{s.baseTotal > 0 ? ((s.bonusTotal / s.baseTotal) * 100).toFixed(2) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-bold mb-4 border-b pb-2">Resumo por Equipe</h3>
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700 text-xs uppercase"><tr><th className="p-3">Equipe</th><th className="p-3 text-center">Func.</th><th className="p-3 text-right">Base (C/ Prov)</th><th className="p-3 text-right">Bônus</th><th className="p-3 text-right">%</th></tr></thead>
            <tbody className="divide-y">{teamSummary.map(t => (<tr key={t.name}><td className="p-3">{t.name}</td><td className="p-3 text-center">{t.count}</td><td className="p-3 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.baseTotal)}</td><td className="p-3 text-right font-mono text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.bonusTotal)}</td><td className="p-3 text-right font-mono">{t.baseTotal > 0 ? ((t.bonusTotal / t.baseTotal) * 100).toFixed(2) : 0}%</td></tr>))}</tbody>
          </table>
        </div>

        <h3 className="text-xl font-bold mb-4 border-b pb-2 break-before-page">Detalhamento</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-700 uppercase"><tr><th className="p-2">Nome</th><th className="p-2">Função</th><th className="p-2 text-right">Salário</th><th className="p-2 text-right">Bônus</th><th className="p-2 text-right">Encargos</th><th className="p-2 text-right">Provisões</th><th className="p-2 text-right font-bold">Total Custo</th><th className="p-2">Regra</th></tr></thead>
            <tbody className="divide-y">{simulation.details.sort((a,b) => a.name.localeCompare(b.name)).map((d, idx) => (
              <tr key={idx} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${d.isSimulated ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                <td className="p-2 font-medium">
                  {d.name}
                  {d.isSimulated && <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded">PROJ</span>}
                </td>
                <td className="p-2 text-slate-500">{d.role}</td>
                <td className="p-2 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.baseSalary)}</td>
                <td className="p-2 text-right font-mono text-emerald-600 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.bonusApplied)}</td>
                <td className="p-2 text-right font-mono text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.chargesValue)}</td>
                <td className="p-2 text-right font-mono text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.provisionsValue || 0)}</td>
                <td className="p-2 text-right font-mono font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.totalCost)}</td>
                <td className="p-2 text-xs text-blue-600 truncate max-w-[150px]">{d.ruleName}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Componentes de Avaliação ---
function EvaluationSystemView({ currentUser, employees, appId, db, showNotification, triggerConfirm }) {
  const [phase, setPhase] = useState(currentUser.role === 'avaliador' ? 2 : 1);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth());
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  
  // Computed ISO string for data fetching
  const period = `${periodYear}-${String(periodMonth + 1).padStart(2, '0')}`;

  const [teamGoals, setTeamGoals] = useState({});
  const [individualEvals, setIndividualEvals] = useState({});
  const [loadingData, setLoadingData] = useState(false);

  const uniqueTeams = useMemo(() => [...new Set(employees.map(e => e.team))].sort(), [employees]);

  useEffect(() => {
    if (!period) return;
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const goalsSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'evaluations_goals'), where('period', '==', period)));
        const goalsMap = {}; goalsSnap.forEach(doc => goalsMap[doc.data().team] = { ...doc.data(), id: doc.id });
        setTeamGoals(goalsMap);
        const evalsSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'evaluations_entries'), where('period', '==', period)));
        const evalsMap = {}; evalsSnap.forEach(doc => evalsMap[doc.data().employeeId] = { ...doc.data(), id: doc.id });
        setIndividualEvals(evalsMap);
      } catch (e) { showNotification('Erro ao carregar', 'error'); } finally { setLoadingData(false); }
    };
    fetchData();
  }, [period, appId, db]);

  const isAvaliador = currentUser.role === 'avaliador';
  const isAdmin = currentUser.role === 'admin';

  // Month names
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const years = [2024, 2025, 2026];

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-6">
        <div><h2 className="text-2xl font-bold flex items-center gap-2"><Target className="text-purple-600"/> Sistema de Avaliação</h2></div>
        
        {/* New Period Selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
           <div className="relative">
              <select 
                value={periodMonth} 
                onChange={(e) => setPeriodMonth(parseInt(e.target.value))}
                className="appearance-none bg-transparent pl-4 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-white outline-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded"
              >
                 {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
           </div>
           <div className="h-6 w-px bg-slate-200 dark:bg-slate-600"></div>
           <div className="relative">
              <select 
                value={periodYear} 
                onChange={(e) => setPeriodYear(parseInt(e.target.value))}
                className="appearance-none bg-transparent pl-4 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-white outline-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded"
              >
                 {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 text-slate-400 pointer-events-none"/>
           </div>
        </div>
      </div>
      
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        {!isAvaliador && <button onClick={() => setPhase(1)} className={`px-4 py-2 rounded text-sm font-medium ${phase === 1 ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>1. Metas</button>}
        <button onClick={() => setPhase(2)} className={`px-4 py-2 rounded text-sm font-medium ${phase === 2 ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>2. Avaliação</button>
        {!isAvaliador && <button onClick={() => setPhase(3)} className={`px-4 py-2 rounded text-sm font-medium ${phase === 3 ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>3. Dashboards</button>}
      </div>

      {loadingData ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-purple-600"/></div> : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 min-h-[500px]">
          {phase === 1 && !isAvaliador && <Phase1TeamGoals teams={uniqueTeams} goalsData={teamGoals} period={period} appId={appId} db={db} onUpdate={(t, d) => setTeamGoals(p => ({...p, [t]: d}))} showNotification={showNotification}/>}
          {phase === 2 && 
            <Phase2IndividualEval 
              teams={uniqueTeams} 
              employees={employees} 
              evalsData={individualEvals} 
              period={period} 
              appId={appId} 
              db={db} 
              onUpdate={(id, d) => setIndividualEvals(p => ({...p, [id]: d}))} 
              showNotification={showNotification} 
              triggerConfirm={triggerConfirm}
              readOnly={currentUser.role === 'editor'} 
              forceUnlock={isAdmin}
            />
          }
          {phase === 3 && !isAvaliador && <Phase3Dashboards teams={uniqueTeams} employees={employees} appId={appId} db={db} initialPeriod={period}/>}
        </div>
      )}
    </div>
  );
}

function Phase1TeamGoals({ teams, goalsData, period, appId, db, onUpdate, showNotification }) {
  const handleSave = async (team, field, value) => {
    const current = goalsData[team] || { period, team, goalType: 'Aplicação M²', target: 0, achieved: 0, basePremium: 0 };
    const updated = { ...current, [field]: value };
    onUpdate(team, updated);
    try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'evaluations_goals', updated.id || `${period}_${team.replace(/\s+/g, '_')}`), updated); } catch(e) { showNotification('Erro salvar meta', 'error'); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 dark:bg-slate-700 text-xs uppercase"><tr><th className="p-3">Equipe</th><th className="p-3">Meta</th><th className="p-3 w-32">Alvo</th><th className="p-3 w-32">Resultado</th><th className="p-3 w-32">Prêmio Base</th><th className="p-3 text-right">Prêmio/Unid</th><th className="p-3 text-center">Status</th></tr></thead>
        <tbody className="divide-y">{teams.map(team => {
          const data = goalsData[team] || {};
          const target = parseFloat(data.target) || 0; const achieved = parseFloat(data.achieved) || 0; const base = parseFloat(data.basePremium) || 0;
          return (
            <tr key={team}>
              <td className="p-3 font-medium">{team}</td>
              <td className="p-3"><select className="w-full bg-transparent border-b outline-none text-xs" value={data.goalType || 'Aplicação M²'} onChange={e => handleSave(team, 'goalType', e.target.value)}><option>Aplicação M²</option><option>Obras Finalizadas</option></select></td>
              <td className="p-3"><input type="number" className="w-full p-1 border rounded" value={data.target || ''} onChange={e => handleSave(team, 'target', e.target.value)} placeholder="0"/></td>
              <td className="p-3"><input type="number" className="w-full p-1 border rounded" value={data.achieved || ''} onChange={e => handleSave(team, 'achieved', e.target.value)} placeholder="0"/></td>
              <td className="p-3"><input type="number" className="w-full p-1 border rounded" value={data.basePremium || ''} onChange={e => handleSave(team, 'basePremium', e.target.value)} placeholder="R$"/></td>
              <td className="p-3 text-right font-mono">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(target > 0 ? base / target : 0)}</td>
              <td className="p-3 text-center"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${achieved >= target && target > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{achieved >= target && target > 0 ? 'ATINGIDA' : 'NÃO ATINGIDA'}</span></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Phase2IndividualEval({ teams, employees, evalsData, period, appId, db, onUpdate, showNotification, triggerConfirm, readOnly, forceUnlock }) {
  const [selectedTeam, setSelectedTeam] = useState(teams[0] || '');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const teamEmployees = useMemo(() => employees.filter(e => e.team === selectedTeam).sort((a,b) => a.name.localeCompare(b.name)), [employees, selectedTeam]);
  
  const currentEval = evalsData[selectedEmpId] || { 
    period, employeeId: selectedEmpId, 
    criteria: { punctuality: 0, proactivity: 0, safety: 0, quality: 0, care: 0, flexibility: 0 }, 
    absences: 0, medicalCerts: 0, 
    locked: false // Novo campo de trava
  };

  // Handler genérico para atualizações locais (antes de salvar definitivamente)
  const handleChange = (field, value, isCriteria = false) => {
    if (!selectedEmpId || currentEval.locked) return; // Impede edição se travado
    let updated = { ...currentEval };
    if (isCriteria) updated.criteria = { ...updated.criteria, [field]: parseInt(value) }; 
    else updated[field] = parseFloat(value);
    
    const scores = Object.values(updated.criteria);
    updated.averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    onUpdate(selectedEmpId, updated); // Atualiza estado local para feedback visual imediato
  };

  // Handler para SALVAR e TRAVAR
  const handleLockAndSave = () => {
    triggerConfirm('Finalizar', 'Ao salvar, a avaliação será travada.', async () => {
      const finalEval = { ...currentEval, locked: true };
      onUpdate(selectedEmpId, finalEval); // Atualiza UI
      try { 
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'evaluations_entries', finalEval.id || `${period}_${selectedEmpId}`), finalEval); 
        showNotification('Avaliação finalizada e salva com sucesso!');
      } catch(e) { 
        console.error(e); 
        showNotification('Erro ao salvar.', 'error');
      }
    });
  };

  const criteriaList = [
    { key: 'punctuality', label: '1. Assiduidade e Pontualidade', desc: 'Cumprimento rigoroso do horário, frequência e pontualidade.' },
    { key: 'proactivity', label: '2. Proatividade e Iniciativa', desc: 'Capacidade de antecipar problemas e propor melhorias.' },
    { key: 'safety', label: '3. Normas de Segurança e EPIs', desc: 'Cumprimento integral das normas e uso adequado de EPIs.' },
    { key: 'quality', label: '4. Qualidade e Eficiência Operacional', desc: 'Produtividade e mínimo retrabalho.' },
    { key: 'care', label: '5. Cuidado e Manutenção de Equipamentos', desc: 'Zelo e inspeções básicas do equipamento.' },
    { key: 'flexibility', label: '6. Flexibilidade e Colaboração', desc: 'Apoio aos colegas e adaptação à mudanças.' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="md:col-span-1 space-y-4 border-r pr-4">
        <div><label className="text-xs font-bold">Equipe</label><select className="w-full p-2 border rounded" value={selectedTeam} onChange={e => {setSelectedTeam(e.target.value); setSelectedEmpId('');}}>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label className="text-xs font-bold">Funcionário</label><div className="max-h-[400px] overflow-y-auto">{teamEmployees.map(e => {
           const isLocked = evalsData[e.id]?.locked;
           return (<button key={e.id} onClick={() => setSelectedEmpId(e.id)} className={`w-full text-left p-2 rounded text-sm flex justify-between items-center ${selectedEmpId === e.id ? 'bg-purple-100 font-bold' : 'hover:bg-slate-50'}`}><span className="truncate">{e.name}</span>{isLocked ? <Lock size={12} className="text-slate-400"/> : (evalsData[e.id] && <CheckCircle size={12} className="text-green-500"/>)}</button>);
        })}</div></div>
      </div>
      <div className="md:col-span-3">
        {!selectedEmpId ? <div className="text-slate-400 italic text-center mt-10">Selecione...</div> : (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center border-b pb-2">
               <div>
                  <h3 className="font-bold text-lg">{teamEmployees.find(e => e.id === selectedEmpId)?.name}</h3>
                  {currentEval.locked && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded flex items-center gap-1 w-fit mt-1"><Lock size={10}/> Avaliação Finalizada</span>}
               </div>
               <div className="text-right"><span className="text-xs text-slate-500 uppercase block">Média</span><span className={`text-2xl font-bold ${currentEval.averageScore >= 3 ? 'text-green-600' : 'text-amber-600'}`}>{(currentEval.averageScore || 0).toFixed(1)}</span></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {criteriaList.map(item => (
                <div key={item.key} className={currentEval.locked ? "opacity-60 pointer-events-none" : ""}>
                  <div className="flex justify-between items-end mb-1">
                    <label className="font-bold text-sm text-slate-700 dark:text-slate-200">{item.label}</label>
                    <span className="font-bold text-purple-600 text-lg">{currentEval.criteria[item.key] || 0}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2 italic leading-tight">{item.desc}</p>
                  <input type="range" min="1" max="5" className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600" value={currentEval.criteria[item.key] || 0} onChange={e => handleChange(item.key, e.target.value, true)} disabled={currentEval.locked}/>
                  <div className="flex justify-between text-[10px] text-slate-400 px-1 mt-1 font-medium"><span>1 (Ruim)</span><span>2</span><span>3</span><span>4</span><span>5 (Excelente)</span></div>
                </div>
              ))}
            </div>
            
            <div className={`bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg grid grid-cols-2 gap-4 mt-4 border border-slate-100 dark:border-slate-700 ${currentEval.locked ? "opacity-60 pointer-events-none" : ""}`}>
               <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Faltas no Período</label>
                  <input type="number" min="0" className="w-full p-2 border rounded dark:bg-slate-600 dark:border-slate-500" value={currentEval.absences} onChange={e => handleChange('absences', e.target.value)} disabled={currentEval.locked}/>
                  <p className="text-[10px] text-red-500 mt-1 font-medium">–25% do prêmio base por falta</p>
               </div>
               <div>
                  <label className="block text-xs font-bold mb-1 text-slate-700 dark:text-slate-300">Atestados no Período</label>
                  <input type="number" min="0" className="w-full p-2 border rounded dark:bg-slate-600 dark:border-slate-500" value={currentEval.medicalCerts} onChange={e => handleChange('medicalCerts', e.target.value)} disabled={currentEval.locked}/>
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">–10% do prêmio base por atestado</p>
               </div>
            </div>
            
            {/* Botão de Salvar - Só aparece se não estiver travado */}
            {!currentEval.locked && (
               <div className="flex justify-end pt-4 border-t mt-4">
                  <button 
                     onClick={handleLockAndSave}
                     className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg transform active:scale-95 transition-all"
                  >
                     <Save size={18}/> Salvar Avaliação Final
                  </button>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Phase3Dashboards({ teams, employees, appId, db, initialPeriod }) {
  const [filterType, setFilterType] = useState('month');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedSub, setSelectedSub] = useState(new Date().toISOString().slice(0, 7)); 
  const [dashboardType, setDashboardType] = useState('general');
  const [selectedTeam, setSelectedTeam] = useState(teams[0] || '');
  
  const [goalsData, setGoalsData] = useState({});
  const [evalsData, setEvalsData] = useState({});
  const [loading, setLoading] = useState(false);

  // Calcular Range de Datas
  const dateRange = useMemo(() => {
    let start = '', end = '';
    if (filterType === 'month') {
      start = selectedSub; end = selectedSub;
    } else if (filterType === 'quarter') {
      const q = parseInt(selectedSub); // 1..4
      const mStart = (q - 1) * 3 + 1;
      const mEnd = mStart + 2;
      start = `${selectedYear}-${String(mStart).padStart(2,'0')}`;
      end = `${selectedYear}-${String(mEnd).padStart(2,'0')}`;
    } else if (filterType === 'semester') {
      const s = parseInt(selectedSub); // 1..2
      const mStart = (s - 1) * 6 + 1;
      const mEnd = mStart + 5;
      start = `${selectedYear}-${String(mStart).padStart(2,'0')}`;
      end = `${selectedYear}-${String(mEnd).padStart(2,'0')}`;
    } else if (filterType === 'year') {
      start = `${selectedYear}-01`;
      end = `${selectedYear}-12`;
    }
    return { start, end };
  }, [filterType, selectedYear, selectedSub]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const goalsQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'evaluations_goals'), where('period', '>=', dateRange.start), where('period', '<=', dateRange.end));
        const evalsQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'evaluations_entries'), where('period', '>=', dateRange.start), where('period', '<=', dateRange.end));
        
        const [gSnap, eSnap] = await Promise.all([getDocs(goalsQ), getDocs(evalsQ)]);
        
        // Aggregate Goals by Team
        const gMap = {};
        gSnap.forEach(doc => {
          const d = doc.data();
          if (!gMap[d.team]) gMap[d.team] = { target: 0, achieved: 0, basePremium: 0, count: 0 };
          gMap[d.team].target += parseFloat(d.target) || 0;
          gMap[d.team].achieved += parseFloat(d.achieved) || 0;
          // Base Premium is summed? Or averaged? Usually sum for financial total
          gMap[d.team].basePremium += parseFloat(d.basePremium) || 0;
          gMap[d.team].count++;
          // Keep monthly detail for precise calculation
          if (!gMap[d.team].monthly) gMap[d.team].monthly = {};
          gMap[d.team].monthly[d.period] = d; 
        });
        setGoalsData(gMap);

        // Aggregate Evals by Employee
        const eMap = {};
        eSnap.forEach(doc => {
          const d = doc.data();
          if (!eMap[d.employeeId]) eMap[d.employeeId] = { entries: [] };
          eMap[d.employeeId].entries.push(d);
        });
        setEvalsData(eMap);

      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchData();
  }, [dateRange, appId, db]);

  // Cálculos Gerais
  const generalStats = useMemo(() => {
    let teamsHit = 0, totalEligible = 0, totalNonEligible = 0;
    const teamPerformance = [];
    
    teams.forEach(t => {
      const goalAgg = goalsData[t];
      if (!goalAgg) return;
      
      // Check logic for aggregations: did they hit target overall? 
      const isHit = goalAgg.target > 0 && goalAgg.achieved >= goalAgg.target;
      const rate = goalAgg.target > 0 ? (goalAgg.achieved / goalAgg.target) * 100 : 0;
      teamPerformance.push({ team: t, rate, isHit });

      // Calculate eligible based on monthly granularity to be precise
      // Or aggregated? Simplified: use aggregated basePremium if hit
      // Better: Sum of monthly premiums where goal was hit
      let teamEligible = 0;
      let teamNonEligible = 0;
      if (goalAgg.monthly) {
        Object.values(goalAgg.monthly).forEach(m => {
           const hit = parseFloat(m.achieved) >= parseFloat(m.target);
           if (hit) teamEligible += parseFloat(m.basePremium);
           else teamNonEligible += parseFloat(m.basePremium);
        });
      }
      
      totalEligible += teamEligible;
      totalNonEligible += teamNonEligible;
      if (isHit) teamsHit++; // Overall period hit
    });
    
    return { teamsHit, totalEligible, totalNonEligible, teamPerformance: teamPerformance.sort((a,b) => b.rate - a.rate) };
  }, [teams, goalsData]);

  // Cálculos por Equipe
  const teamStats = useMemo(() => {
    if (!selectedTeam) return { members: [] };
    const goalAgg = goalsData[selectedTeam];
    
    // Aggregate values for display
    const target = goalAgg?.target || 0;
    const achieved = goalAgg?.achieved || 0;
    const isHit = target > 0 && achieved >= target;

    const members = employees.filter(e => e.team === selectedTeam).map(emp => {
      const empEvals = evalsData[emp.id]?.entries || [];
      if (empEvals.length === 0) return null;

      // Calculate Average Score over period
      const avgScore = empEvals.reduce((sum, ev) => sum + (ev.averageScore || 0), 0) / empEvals.length;
      const totalAbsences = empEvals.reduce((sum, ev) => sum + (ev.absences || 0), 0);
      const totalMedical = empEvals.reduce((sum, ev) => sum + (ev.medicalCerts || 0), 0);

      // Calculate Final Premium: Sum of monthly calculations
      let totalFinalPremium = 0;
      empEvals.forEach(ev => {
         const monthGoal = goalAgg?.monthly?.[ev.period];
         if (monthGoal) {
            const base = parseFloat(monthGoal.basePremium) || 0;
            const hit = parseFloat(monthGoal.achieved) >= parseFloat(monthGoal.target);
            if (hit) {
               let adj = base - (base * 0.25 * (ev.absences || 0)) - (base * 0.10 * (ev.medicalCerts || 0));
               if (adj < 0) adj = 0;
               totalFinalPremium += adj * ((ev.averageScore || 0) / 10);
            }
         }
      });

      return { 
        ...emp, 
        avg: avgScore, 
        final: totalFinalPremium,
        absences: totalAbsences,
        medicalCerts: totalMedical
      };
    }).filter(Boolean);

    const teamAvg = members.length > 0 ? members.reduce((a,b) => a + b.avg, 0) / members.length : 0;
    return { members, isHit, target, achieved, teamAvg };
  }, [selectedTeam, employees, goalsData, evalsData]);

  return (
    <div className="space-y-6">
      {/* Filtros do Dashboard */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border flex flex-wrap gap-4 items-center">
         <div className="flex items-center gap-2">
            <Filter size={18} className="text-purple-600"/>
            <span className="text-sm font-bold text-slate-500 uppercase">Visualização:</span>
         </div>
         <select className="p-2 border rounded text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="month">Mês</option>
            <option value="quarter">Trimestre</option>
            <option value="semester">Semestre</option>
            <option value="year">Ano Todo</option>
         </select>

         {filterType === 'month' && <input type="month" className="p-2 border rounded text-sm" value={selectedSub} onChange={e => setSelectedSub(e.target.value)} />}
         
         {filterType !== 'month' && (
            <select className="p-2 border rounded text-sm" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
               <option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option>
            </select>
         )}

         {filterType === 'quarter' && (
            <select className="p-2 border rounded text-sm" value={selectedSub} onChange={e => setSelectedSub(e.target.value)}>
               <option value="1">1º Trimestre</option><option value="2">2º Trimestre</option><option value="3">3º Trimestre</option><option value="4">4º Trimestre</option>
            </select>
         )}

         {filterType === 'semester' && (
            <select className="p-2 border rounded text-sm" value={selectedSub} onChange={e => setSelectedSub(e.target.value)}>
               <option value="1">1º Semestre</option><option value="2">2º Semestre</option>
            </select>
         )}
      </div>

      {/* Seleção de Tipo de Dashboard */}
      <div className="flex justify-center gap-4">
        <button onClick={() => setDashboardType('general')} className={`px-4 py-2 rounded-full text-sm font-bold ${dashboardType === 'general' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Visão Geral</button>
        <button onClick={() => setDashboardType('team')} className={`px-4 py-2 rounded-full text-sm font-bold ${dashboardType === 'team' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Por Equipe</button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-purple-600"/></div> : (
      <>
        {dashboardType === 'general' ? (
          <div className="space-y-6 animate-in zoom-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-100"><div className="flex justify-between"><div><p className="text-xs uppercase text-green-600 font-bold">Equipes na Meta</p><p className="text-3xl font-bold">{generalStats.teamsHit} <span className="text-sm text-slate-400 font-normal">/ {teams.length}</span></p></div><Trophy className="text-green-500 opacity-50" size={32}/></div></div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100"><div className="flex justify-between"><div><p className="text-xs uppercase text-blue-600 font-bold">Prêmio Elegível</p><p className="text-3xl font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(generalStats.totalEligible)}</p></div><TrendingUp className="text-blue-500 opacity-50" size={32}/></div></div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-100"><div className="flex justify-between"><div><p className="text-xs uppercase text-red-600 font-bold">Prêmio Não Elegível</p><p className="text-3xl font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(generalStats.totalNonEligible)}</p></div><TrendingDown className="text-red-500 opacity-50" size={32}/></div></div>
            </div>
            <div className="bg-slate-50 p-6 rounded-lg">
              <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={18}/> Ranking de Atingimento de Metas (Acumulado)</h4>
              <div className="space-y-3">
                {generalStats.teamPerformance.map(tp => (
                  <div key={tp.team} className="flex items-center gap-4">
                    <div className="w-32 text-xs font-medium truncate text-right" title={tp.team}>{tp.team}</div>
                    <div className="flex-1 h-4 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${tp.isHit ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(tp.rate, 100)}%` }}></div></div>
                    <div className="w-12 text-xs font-bold">{tp.rate.toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in zoom-in">
            <div className="flex items-center gap-4 mb-6">
              <select className="p-2 border rounded bg-white dark:bg-slate-700" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            
            {/* 1. Resultado Geral da Equipe */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow border border-slate-100">
               <h4 className="font-bold text-lg mb-4 border-b pb-2">Resultado Geral da Equipe (Acumulado)</h4>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div><p className="text-xs text-slate-500 uppercase">Meta Definida</p><p className="font-bold text-lg">{teamStats.target}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase">Resultado</p><p className="font-bold text-lg">{teamStats.achieved}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase">Status</p><span className={`px-2 py-1 rounded text-xs font-bold ${teamStats.isHit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{teamStats.isHit ? 'META ATINGIDA' : 'NÃO ATINGIDA'}</span></div>
                  <div><p className="text-xs text-slate-500 uppercase">Média Notas Equipe</p><p className="font-bold text-lg text-purple-600">{teamStats.teamAvg.toFixed(1)}</p></div>
               </div>
            </div>

            {/* 2. Lista de Funcionários */}
            <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-100">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase text-slate-500"><tr><th className="p-3">Funcionário</th><th className="p-3 text-center">Média Notas</th><th className="p-3 text-center">Faltas</th><th className="p-3 text-center">Atestados</th><th className="p-3 text-right">Prêmio Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {teamStats.members.map(m => (
                    <tr key={m.id}>
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className="p-3 text-center font-bold">{m.avg.toFixed(1)}</td>
                      <td className="p-3 text-center text-red-500">{m.absences > 0 ? `-${m.absences}` : '-'}</td>
                      <td className="p-3 text-center text-amber-500">{m.medicalCerts > 0 ? `-${m.medicalCerts}` : '-'}</td>
                      <td className="p-3 text-right font-mono font-bold text-green-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
      )}
    </div>
  );
}