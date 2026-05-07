import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import authBackground from '../../asset/yafz80bo0l.png';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type AuthView = 'password' | 'emailCode' | 'register' | 'emailRegister';
type HomeView = 'overview' | 'workspace' | 'tokens' | 'account';
type CodeScene = 'login' | 'register';

type User = {
  userId?: string;
  account?: string;
  displayName?: string;
  email?: string;
  mobile?: string;
};

type LoginData = {
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  scope?: string;
  sessionId?: string;
  user?: User;
};

type LoginResponse = {
  code: number;
  msg: string;
  uuid: string;
  data?: LoginData | null;
};

type RegisterResponse = {
  code: number;
  msg: string;
  uuid: string;
  data?: {
    userId?: string;
    account?: string;
    displayName?: string;
    status?: string;
    createdAt?: string;
  } | null;
};

type BaseResponse = {
  code: number;
  msg: string;
  uuid: string;
  data?: {
    message?: string;
  } | null;
};

type ValidationErrors = Partial<Record<string, string>>;

const authViews: Array<{ key: AuthView; label: string }> = [
  { key: 'password', label: '登录' },
  { key: 'emailCode', label: '验证码' },
  { key: 'register', label: '注册' },
  { key: 'emailRegister', label: '邮箱' },
];

const sidebarItems: Array<{ key: HomeView; label: string; hint: string }> = [
  { key: 'overview', label: '总览', hint: '工作台状态' },
  { key: 'workspace', label: '空间', hint: '项目与流程' },
  { key: 'tokens', label: '会话', hint: 'Token 与刷新' },
  { key: 'account', label: '账号', hint: '身份与安全' },
];

const runtimeApp = () => {
  const app = window.go?.main?.App;
  if (!app) {
    throw new Error('当前不是 Wails 运行环境，请使用 `wails dev` 启动桌面应用');
  }
  return app;
};

const shortToken = (value?: string) => {
  if (!value) {
    return '未返回';
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const formatExpiry = (seconds?: number) => {
  if (!seconds || seconds <= 0) {
    return '未返回';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${rest} 秒`;
};

const isEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

export default function App() {
  const [authView, setAuthView] = useState<AuthView>('password');
  const [homeView, setHomeView] = useState<HomeView>('overview');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('请输入信息。');
  const [booting, setBooting] = useState(true);
  const [remember, setRemember] = useState(true);
  const [clientId, setClientId] = useState('ops_console_web');
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [registerResponse, setRegisterResponse] = useState<RegisterResponse | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [loginCodeCountdown, setLoginCodeCountdown] = useState(0);
  const [registerCodeCountdown, setRegisterCodeCountdown] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logoutAnimating, setLogoutAnimating] = useState(false);

  const refreshTimerRef = useRef<number | null>(null);

  const [loginForm, setLoginForm] = useState({ account: '', password: '' });
  const [emailLoginForm, setEmailLoginForm] = useState({ email: '', code: '' });
  const [registerForm, setRegisterForm] = useState({
    account: '',
    password: '',
    displayName: '',
    email: '',
    mobile: '',
  });
  const [emailRegisterForm, setEmailRegisterForm] = useState({
    email: '',
    code: '',
    displayName: '',
    password: '',
  });

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const app = runtimeApp();
        const defaultRuntimeClientID = await app.GetDefaultClientID();
        if (active && defaultRuntimeClientID) {
          setClientId(defaultRuntimeClientID);
        }

        const response = await app.RestoreSession();
        if (!active || !response?.data?.user) {
          return;
        }
        setLoginResponse(response);
        setSubmitState('success');
        setMessage('已恢复并校验本机登录状态。');
      } catch (error) {
        if (!active) {
          return;
        }
        setSubmitState('error');
        setMessage(error instanceof Error ? error.message : '初始化失败');
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loginCodeCountdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setLoginCodeCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [loginCodeCountdown]);

  useEffect(() => {
    if (registerCodeCountdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setRegisterCodeCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [registerCodeCountdown]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const expiresIn = loginResponse?.data?.expiresIn;
    const refreshToken = loginResponse?.data?.refreshToken;
    if (!loginResponse?.data?.accessToken || !refreshToken || !expiresIn || expiresIn <= 90) {
      return;
    }

    const delayMs = Math.max((expiresIn - 60) * 1000, 15000);
    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        setIsRefreshing(true);
        const response = await runtimeApp().RefreshSession(clientId.trim());
        setLoginResponse(response);
        setSubmitState('success');
        setMessage('检测到会话即将过期，已自动刷新 Token。');
      } catch (error) {
        setSubmitState('error');
        setMessage(error instanceof Error ? error.message : '自动刷新 Token 失败');
      } finally {
        setIsRefreshing(false);
      }
    }, delayMs);

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [clientId, loginResponse]);

  const currentUser = loginResponse?.data?.user;
  const isLoggedIn = Boolean(currentUser);

  const canPasswordLogin = useMemo(() => {
    return loginForm.account.trim() !== '' && loginForm.password.trim() !== '';
  }, [loginForm]);

  const canEmailLogin = useMemo(() => {
    return emailLoginForm.email.trim() !== '' && emailLoginForm.code.trim() !== '';
  }, [emailLoginForm]);

  const canRegister = useMemo(() => {
    return registerForm.account.trim() !== '' && registerForm.password.trim() !== '' && registerForm.displayName.trim() !== '';
  }, [registerForm]);

  const canEmailRegister = useMemo(() => {
    return (
      emailRegisterForm.email.trim() !== '' &&
      emailRegisterForm.code.trim() !== '' &&
      emailRegisterForm.displayName.trim() !== '' &&
      emailRegisterForm.password.trim() !== ''
    );
  }, [emailRegisterForm]);

  const workspaceItems = useMemo(
    () => [
      {
        title: 'Agent Studio',
        status: 'Ready',
        desc: '用于承接智能体编排、任务流和执行日志。',
      },
      {
        title: 'Prompt Library',
        status: 'Draft',
        desc: '用于管理提示词模板、变量片段和版本对比。',
      },
      {
        title: 'Knowledge Dock',
        status: 'Queued',
        desc: '用于接入文档导入、检索、知识分片和向量索引。',
      },
    ],
    [],
  );

  const updateMessage = (next: string, state: SubmitState) => {
    setSubmitState(state);
    setMessage(next);
  };

  const clearValidation = () => setValidationErrors({});

  const validatePasswordLogin = () => {
    const next: ValidationErrors = {};
    if (!loginForm.account.trim()) {
      next.loginAccount = '请输入账号';
    }
    if (!loginForm.password.trim()) {
      next.loginPassword = '请输入密码';
    }
    setValidationErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateEmailLogin = () => {
    const next: ValidationErrors = {};
    if (!emailLoginForm.email.trim()) {
      next.emailLoginEmail = '请输入邮箱';
    } else if (!isEmail(emailLoginForm.email.trim())) {
      next.emailLoginEmail = '请输入有效邮箱地址';
    }
    if (!emailLoginForm.code.trim()) {
      next.emailLoginCode = '请输入验证码';
    }
    setValidationErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateRegister = () => {
    const next: ValidationErrors = {};
    if (!registerForm.account.trim()) {
      next.registerAccount = '请输入注册账号';
    }
    if (!registerForm.displayName.trim()) {
      next.registerDisplayName = '请输入显示名';
    }
    if (!registerForm.password.trim()) {
      next.registerPassword = '请输入密码';
    } else if (registerForm.password.trim().length < 8) {
      next.registerPassword = '密码至少需要 8 位';
    }
    if (registerForm.email.trim() && !isEmail(registerForm.email.trim())) {
      next.registerEmail = '邮箱格式不正确';
    }
    setValidationErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateEmailRegister = () => {
    const next: ValidationErrors = {};
    if (!emailRegisterForm.email.trim()) {
      next.emailRegisterEmail = '请输入邮箱';
    } else if (!isEmail(emailRegisterForm.email.trim())) {
      next.emailRegisterEmail = '邮箱格式不正确';
    }
    if (!emailRegisterForm.code.trim()) {
      next.emailRegisterCode = '请输入验证码';
    }
    if (!emailRegisterForm.displayName.trim()) {
      next.emailRegisterDisplayName = '请输入显示名';
    }
    if (!emailRegisterForm.password.trim()) {
      next.emailRegisterPassword = '请输入密码';
    } else if (emailRegisterForm.password.trim().length < 8) {
      next.emailRegisterPassword = '密码至少需要 8 位';
    }
    setValidationErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePasswordLogin = async (event: Event) => {
    event.preventDefault();
    clearValidation();
    if (!validatePasswordLogin()) {
      updateMessage('请先补全账号密码信息。', 'error');
      return;
    }

    updateMessage('正在通过账号密码登录...', 'submitting');
    try {
      const response = await runtimeApp().Login(loginForm.account.trim(), loginForm.password.trim(), remember);
      setLoginResponse(response);
      setRegisterResponse(null);
      setLoginForm((prev) => ({ ...prev, password: '' }));
      updateMessage(response.msg || '登录成功，正在进入桌面工作台。', 'success');
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '登录失败，请稍后重试', 'error');
    }
  };

  const handleEmailCodeLogin = async (event: Event) => {
    event.preventDefault();
    clearValidation();
    if (!validateEmailLogin()) {
      updateMessage('请先补全邮箱验证码登录信息。', 'error');
      return;
    }

    updateMessage('正在通过邮箱验证码换取 Token...', 'submitting');
    try {
      const response = await runtimeApp().LoginByEmailCode(
        emailLoginForm.email.trim(),
        emailLoginForm.code.trim(),
        clientId.trim(),
        remember,
      );
      setLoginResponse(response);
      setRegisterResponse(null);
      setEmailLoginForm((prev) => ({ ...prev, code: '' }));
      updateMessage(response.msg || '验证码登录成功。', 'success');
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '邮箱验证码登录失败', 'error');
    }
  };

  const handleRegister = async (event: Event) => {
    event.preventDefault();
    clearValidation();
    if (!validateRegister()) {
      updateMessage('请检查注册信息是否完整。', 'error');
      return;
    }

    updateMessage('正在提交账号注册...', 'submitting');
    try {
      const response = await runtimeApp().Register(
        registerForm.account.trim(),
        registerForm.password.trim(),
        registerForm.displayName.trim(),
        registerForm.email.trim(),
        registerForm.mobile.trim(),
      );
      setRegisterResponse(response);
      updateMessage(response.msg || '账号注册成功，可以切换到登录继续。', 'success');
      setAuthView('password');
      setLoginForm((prev) => ({ ...prev, account: registerForm.account.trim() }));
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '账号注册失败', 'error');
    }
  };

  const handleEmailRegister = async (event: Event) => {
    event.preventDefault();
    clearValidation();
    if (!validateEmailRegister()) {
      updateMessage('请检查邮箱验证码注册信息。', 'error');
      return;
    }

    updateMessage('正在提交邮箱验证码注册...', 'submitting');
    try {
      const response = await runtimeApp().RegisterByEmail(
        emailRegisterForm.email.trim(),
        emailRegisterForm.code.trim(),
        emailRegisterForm.displayName.trim(),
        emailRegisterForm.password.trim(),
      );
      setRegisterResponse({
        code: response.code,
        msg: response.msg,
        uuid: response.uuid,
        data: {
          displayName: emailRegisterForm.displayName.trim(),
        },
      });
      updateMessage(response.msg || '邮箱验证码注册成功，请返回登录。', 'success');
      setAuthView('emailCode');
      setEmailLoginForm((prev) => ({ ...prev, email: emailRegisterForm.email.trim() }));
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '邮箱验证码注册失败', 'error');
    }
  };

  const handleSendEmailCode = async (scene: CodeScene) => {
    clearValidation();
    const email = scene === 'login' ? emailLoginForm.email.trim() : emailRegisterForm.email.trim();
    if (!email) {
      updateMessage('请先输入邮箱，再发送验证码。', 'error');
      setValidationErrors((prev) => ({
        ...prev,
        [scene === 'login' ? 'emailLoginEmail' : 'emailRegisterEmail']: '请先填写邮箱',
      }));
      return;
    }
    if (!isEmail(email)) {
      updateMessage('邮箱格式不正确。', 'error');
      setValidationErrors((prev) => ({
        ...prev,
        [scene === 'login' ? 'emailLoginEmail' : 'emailRegisterEmail']: '请输入有效邮箱地址',
      }));
      return;
    }

    updateMessage(`正在发送${scene === 'login' ? '登录' : '注册'}验证码...`, 'submitting');
    try {
      const response = await runtimeApp().SendEmailCode(email, scene);
      if (scene === 'login') {
        setLoginCodeCountdown(60);
      } else {
        setRegisterCodeCountdown(60);
      }
      updateMessage(response.msg || '验证码已发送，请查收邮箱。', 'success');
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '验证码发送失败', 'error');
    }
  };

  const handleRefreshSession = async (source: 'manual' | 'auto' = 'manual') => {
    if (source === 'manual') {
      updateMessage('正在刷新当前会话 Token...', 'submitting');
    }
    try {
      setIsRefreshing(true);
      const response = await runtimeApp().RefreshSession(clientId.trim());
      setLoginResponse(response);
      updateMessage(source === 'auto' ? '会话临近过期，已自动刷新 Token。' : response.msg || 'Token 刷新成功。', 'success');
    } catch (error) {
      updateMessage(error instanceof Error ? error.message : '刷新 Token 失败', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    updateMessage('正在退出登录...', 'submitting');
    try {
      setLogoutAnimating(true);
      const response = await runtimeApp().Logout();
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      setLoginResponse(null);
      setRegisterResponse(null);
      setHomeView('overview');
      setPasswordSafe();
      setLogoutAnimating(false);
      updateMessage(response.msg || response.data?.message || '已退出登录。', 'success');
    } catch (error) {
      setLogoutAnimating(false);
      updateMessage(error instanceof Error ? error.message : '退出登录失败', 'error');
    }
  };

  const setPasswordSafe = () => {
    setLoginForm((prev) => ({ ...prev, password: '' }));
    setEmailLoginForm((prev) => ({ ...prev, code: '' }));
  };

  const authFieldError = (key: string) => validationErrors[key];

  const renderAuthForm = () => {
    if (authView === 'password') {
      return (
        <form className="auth-form" onSubmit={handlePasswordLogin}>
          <label className="field">
            <span>账号</span>
            <input
              type="text"
              placeholder="请输入账号"
              value={loginForm.account}
              onInput={(event) => setLoginForm((prev) => ({ ...prev, account: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('loginAccount') ? <em className="field-error">{authFieldError('loginAccount')}</em> : null}
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="请输入密码"
              value={loginForm.password}
              onInput={(event) => setLoginForm((prev) => ({ ...prev, password: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('loginPassword') ? <em className="field-error">{authFieldError('loginPassword')}</em> : null}
          </label>
          <div className="inline-row">
            <label className="remember-box">
              <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
              <span>记住本机登录状态</span>
            </label>
          </div>
          <button className="submit-button" type="submit" disabled={!canPasswordLogin || submitState === 'submitting' || booting}>
            {booting ? '初始化中...' : submitState === 'submitting' ? '正在登录...' : '进入工作台'}
          </button>
        </form>
      );
    }

    if (authView === 'emailCode') {
      return (
        <form className="auth-form" onSubmit={handleEmailCodeLogin}>
          <label className="field">
            <span>邮箱</span>
            <input
              type="email"
              placeholder="请输入邮箱"
              value={emailLoginForm.email}
              onInput={(event) => setEmailLoginForm((prev) => ({ ...prev, email: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('emailLoginEmail') ? <em className="field-error">{authFieldError('emailLoginEmail')}</em> : null}
          </label>
          <div className="code-row">
            <label className="field">
              <span>验证码</span>
              <input
                type="text"
                placeholder="6 位验证码"
                value={emailLoginForm.code}
                onInput={(event) => setEmailLoginForm((prev) => ({ ...prev, code: (event.target as HTMLInputElement).value }))}
              />
              {authFieldError('emailLoginCode') ? <em className="field-error">{authFieldError('emailLoginCode')}</em> : null}
            </label>
            <button
              className="secondary-button"
              type="button"
              disabled={loginCodeCountdown > 0 || submitState === 'submitting'}
              onClick={() => handleSendEmailCode('login')}
            >
              {loginCodeCountdown > 0 ? `${loginCodeCountdown}s 后重发` : '发送验证码'}
            </button>
          </div>
          <label className="field">
            <span>Client ID</span>
            <input
              type="text"
              placeholder="ops_console_web"
              value={clientId}
              onInput={(event) => setClientId((event.target as HTMLInputElement).value)}
            />
          </label>
          <div className="inline-row">
            <label className="remember-box">
              <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
              <span>记住本机登录状态</span>
            </label>
          </div>
          <button className="submit-button" type="submit" disabled={!canEmailLogin || submitState === 'submitting' || booting}>
            进入工作台
          </button>
        </form>
      );
    }

    if (authView === 'register') {
      return (
        <form className="auth-form" onSubmit={handleRegister}>
          <div className="dual-grid">
            <label className="field">
              <span>账号</span>
              <input
                type="text"
                placeholder="自定义账号"
                value={registerForm.account}
                onInput={(event) => setRegisterForm((prev) => ({ ...prev, account: (event.target as HTMLInputElement).value }))}
              />
              {authFieldError('registerAccount') ? <em className="field-error">{authFieldError('registerAccount')}</em> : null}
            </label>
            <label className="field">
              <span>显示名</span>
              <input
                type="text"
                placeholder="展示给团队看的名字"
                value={registerForm.displayName}
                onInput={(event) => setRegisterForm((prev) => ({ ...prev, displayName: (event.target as HTMLInputElement).value }))}
              />
              {authFieldError('registerDisplayName') ? <em className="field-error">{authFieldError('registerDisplayName')}</em> : null}
            </label>
          </div>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="请输入密码"
              value={registerForm.password}
              onInput={(event) => setRegisterForm((prev) => ({ ...prev, password: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('registerPassword') ? <em className="field-error">{authFieldError('registerPassword')}</em> : null}
          </label>
          <div className="dual-grid">
            <label className="field">
              <span>邮箱</span>
              <input
                type="email"
                placeholder="可选"
                value={registerForm.email}
                onInput={(event) => setRegisterForm((prev) => ({ ...prev, email: (event.target as HTMLInputElement).value }))}
              />
              {authFieldError('registerEmail') ? <em className="field-error">{authFieldError('registerEmail')}</em> : null}
            </label>
            <label className="field">
              <span>手机号</span>
              <input
                type="text"
                placeholder="可选"
                value={registerForm.mobile}
                onInput={(event) => setRegisterForm((prev) => ({ ...prev, mobile: (event.target as HTMLInputElement).value }))}
              />
            </label>
          </div>
          <button className="submit-button" type="submit" disabled={!canRegister || submitState === 'submitting'}>
            提交注册
          </button>
        </form>
      );
    }

    return (
      <form className="auth-form" onSubmit={handleEmailRegister}>
        <label className="field">
          <span>邮箱</span>
          <input
            type="email"
            placeholder="请输入邮箱"
            value={emailRegisterForm.email}
            onInput={(event) => setEmailRegisterForm((prev) => ({ ...prev, email: (event.target as HTMLInputElement).value }))}
          />
          {authFieldError('emailRegisterEmail') ? <em className="field-error">{authFieldError('emailRegisterEmail')}</em> : null}
        </label>
        <div className="code-row">
          <label className="field">
            <span>验证码</span>
            <input
              type="text"
              placeholder="6 位验证码"
              value={emailRegisterForm.code}
              onInput={(event) => setEmailRegisterForm((prev) => ({ ...prev, code: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('emailRegisterCode') ? <em className="field-error">{authFieldError('emailRegisterCode')}</em> : null}
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={registerCodeCountdown > 0 || submitState === 'submitting'}
            onClick={() => handleSendEmailCode('register')}
          >
            {registerCodeCountdown > 0 ? `${registerCodeCountdown}s 后重发` : '发送验证码'}
          </button>
        </div>
        <div className="dual-grid">
          <label className="field">
            <span>显示名</span>
            <input
              type="text"
              placeholder="请输入显示名"
              value={emailRegisterForm.displayName}
              onInput={(event) => setEmailRegisterForm((prev) => ({ ...prev, displayName: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('emailRegisterDisplayName') ? <em className="field-error">{authFieldError('emailRegisterDisplayName')}</em> : null}
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              placeholder="请输入密码"
              value={emailRegisterForm.password}
              onInput={(event) => setEmailRegisterForm((prev) => ({ ...prev, password: (event.target as HTMLInputElement).value }))}
            />
            {authFieldError('emailRegisterPassword') ? <em className="field-error">{authFieldError('emailRegisterPassword')}</em> : null}
          </label>
        </div>
        <button className="submit-button" type="submit" disabled={!canEmailRegister || submitState === 'submitting'}>
          完成注册
        </button>
      </form>
    );
  };

  const renderOverview = () => (
    <section className="content-grid">
      <article className="metric-card">
        <span>当前用户</span>
        <strong>{currentUser?.displayName || currentUser?.account || '未命名用户'}</strong>
        <p>{currentUser?.email || currentUser?.mobile || '还没有绑定更多联系方式'}</p>
      </article>
      <article className="metric-card">
        <span>会话状态</span>
        <strong>{isRefreshing ? 'Refreshing' : 'Healthy'}</strong>
        <p>{isRefreshing ? '正在后台刷新 Token，确保桌面工作区不断线。' : '当前会话已建立，可继续承接真实业务模块。'}</p>
      </article>
      <article className="metric-card wide">
        <span>今日工作面板</span>
        <strong>首页框架已具备可承载真实模块的布局</strong>
        <p>左侧导航可继续映射到项目、Prompt、知识库、执行记录；顶部动作区已经预留刷新会话和退出入口。</p>
      </article>
    </section>
  );

  const renderWorkspace = () => (
    <section className="list-panel">
      <div className="panel-head">
        <div>
          <p className="micro-label">Workspace</p>
          <h3>空间与模块草图</h3>
        </div>
        <button className="secondary-button" type="button">新建空间</button>
      </div>
      <div className="workspace-stack">
        {workspaceItems.map((item) => (
          <article key={item.title}>
            <div className="stack-head">
              <strong>{item.title}</strong>
              <span className="badge">{item.status}</span>
            </div>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );

  const renderTokens = () => (
    <section className="list-panel">
      <div className="panel-head">
        <div>
          <p className="micro-label">Session</p>
          <h3>会话与 Token 管理</h3>
        </div>
        <button className="secondary-button" type="button" onClick={() => handleRefreshSession('manual')} disabled={isRefreshing}>
          {isRefreshing ? '刷新中...' : '刷新 Token'}
        </button>
      </div>
      <div className="token-grid">
        <article>
          <span>Access Token</span>
          <strong>{shortToken(loginResponse?.data?.accessToken)}</strong>
        </article>
        <article>
          <span>Refresh Token</span>
          <strong>{shortToken(loginResponse?.data?.refreshToken)}</strong>
        </article>
        <article>
          <span>Access 过期时间</span>
          <strong>{formatExpiry(loginResponse?.data?.expiresIn)}</strong>
        </article>
        <article>
          <span>Refresh 过期时间</span>
          <strong>{formatExpiry(loginResponse?.data?.refreshExpiresIn)}</strong>
        </article>
        <article>
          <span>Session ID</span>
          <strong>{loginResponse?.data?.sessionId || '未返回'}</strong>
        </article>
        <article>
          <span>Scope</span>
          <strong>{loginResponse?.data?.scope || '未返回'}</strong>
        </article>
      </div>
    </section>
  );

  const renderAccount = () => (
    <section className="list-panel">
      <div className="panel-head">
        <div>
          <p className="micro-label">Account</p>
          <h3>身份与安全面板</h3>
        </div>
        <button className="danger-button" type="button" onClick={handleLogout}>
          退出登录
        </button>
      </div>
      <div className="workspace-stack">
        <article>
          <strong>用户 ID</strong>
          <p>{currentUser?.userId || '未返回'}</p>
        </article>
        <article>
          <strong>账号</strong>
          <p>{currentUser?.account || '未返回'}</p>
        </article>
        <article>
          <strong>邮箱 / 手机</strong>
          <p>{currentUser?.email || currentUser?.mobile || '未返回'}</p>
        </article>
        <article>
          <strong>本地会话恢复</strong>
          <p>{remember ? '已开启，启动时会优先恢复并校验服务端状态。' : '已关闭，退出后不会保存本地会话。'}</p>
        </article>
      </div>
    </section>
  );

  const renderHomeContent = () => {
    if (homeView === 'overview') {
      return renderOverview();
    }
    if (homeView === 'workspace') {
      return renderWorkspace();
    }
    if (homeView === 'tokens') {
      return renderTokens();
    }
    return renderAccount();
  };

  if (isLoggedIn) {
    return (
      <main className={`app-shell ${logoutAnimating ? 'app-shell-leaving' : ''}`}>
        <aside className="sidebar">
          <div>
            <p className="sidebar-kicker">MuGuua AI</p>
            <h1 className="sidebar-title">Workspace</h1>
          </div>

          <nav className="sidebar-nav" aria-label="主导航">
            {sidebarItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${homeView === item.key ? 'nav-item-active' : ''}`}
                type="button"
                onClick={() => setHomeView(item.key)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <span>已登录用户</span>
            <strong>{currentUser?.displayName || currentUser?.account}</strong>
          </div>
        </aside>

        <section className="main-stage">
          <header className="topbar">
            <div>
              <p className="micro-label">Now Viewing</p>
              <h2>{sidebarItems.find((item) => item.key === homeView)?.label}</h2>
            </div>
            <div className="topbar-actions">
              <button className="secondary-button" type="button" onClick={() => handleRefreshSession('manual')} disabled={isRefreshing}>
                {isRefreshing ? '刷新中...' : '刷新 Token'}
              </button>
              <button className="danger-button" type="button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          </header>

          <section className={`status-strip status-${submitState}`}>
            <span>{message}</span>
            <strong>{isRefreshing ? '自动刷新已启用' : currentUser?.email || currentUser?.mobile || currentUser?.account || '当前会话正常'}</strong>
          </section>

          <section className="content-stage">{renderHomeContent()}</section>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="hero-panel">
        <div className="hero-background" style={{ backgroundImage: `url(${authBackground})` }} />
      </section>

      <section className="auth-panel">
        <div className="auth-frame">
          <h2>登录</h2>

          <div className="auth-switcher" role="tablist" aria-label="认证方式切换">
            {authViews.map((item) => (
              <button
                key={item.key}
                className={`switch-chip ${authView === item.key ? 'switch-chip-active' : ''}`}
                type="button"
                onClick={() => {
                  clearValidation();
                  setAuthView(item.key);
                }}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {renderAuthForm()}

          <section className={`status-card status-${submitState}`} aria-live="polite">
            <p className="status-label">接口状态</p>
            <p className="status-message">{booting ? '正在恢复本地会话...' : message}</p>
            {(registerResponse?.data || loginResponse?.data?.user) ? (
              <div className="result-grid compact-grid">
                <div>
                  <span>最近用户</span>
                  <strong>
                    {loginResponse?.data?.user?.displayName ||
                      registerResponse?.data?.displayName ||
                      loginResponse?.data?.user?.account ||
                      registerResponse?.data?.account ||
                      '未返回'}
                  </strong>
                </div>
                <div>
                  <span>Client ID</span>
                  <strong>{clientId}</strong>
                </div>
              </div>
            ) : null}
          </section>

          <footer className="panel-footer">
            <span>MuGuua AI</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
