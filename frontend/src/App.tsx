import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { marked } from 'marked';
import { EventsOn } from '../wailsjs/runtime/runtime';
import loginBackground from '../../asset/yafz80bo0l.png';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type WorkspacePage = 'chat' | 'library' | 'plugins' | 'settings';
type LoginMode = 'password' | 'otp';
type ChatRole = 'user' | 'assistant';

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

type ChatContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string;
};

type ChatMessage = {
  role: ChatRole;
  content: ChatContentBlock[];
};

type ChatResponse = {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content: ChatContentBlock[];
  stop_reason?: string;
  stop_sequence?: string;
};

type ChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type ChatStreamChunkPayload = {
  requestId: string;
  index: number;
  block: ChatContentBlock;
};

type ChatStreamCompletePayload = {
  requestId: string;
  response: ChatResponse;
};

const runtimeApp = () => {
  const app = window.go?.main?.App;
  if (!app) {
    throw new Error('当前不是 Wails 运行环境，请使用 `wails dev` 启动桌面应用');
  }
  return app;
};

const promptCards = [
  {
    title: '高层简报',
    category: '战略',
    desc: '用于高层决策摘要、季度复盘和战略更新。',
  },
  {
    title: '技术评审',
    category: '研发',
    desc: '用于架构风险识别、技术方案比较和实现建议。',
  },
  {
    title: '研究整合',
    category: '知识',
    desc: '用于整理资料、提炼结论和输出结构化洞察。',
  },
  {
    title: '客户声音',
    category: '增长',
    desc: '用于分析反馈、总结趋势和生成优化方向。',
  },
];

const plugins = [
  {
    name: '代码解释器',
    desc: '执行计算、处理数据集，并检查结构化输出结果。',
    status: '已连接',
  },
  {
    name: '图像生成',
    desc: '根据结构化提示生成高质量视觉内容和概念画板。',
    status: '可接入',
  },
  {
    name: '知识库',
    desc: '同步工作空间文档、追踪器和研究笔记。',
    status: '可接入',
  },
  {
    name: '科学计算',
    desc: '访问可验证的计算推理与科学查询能力。',
    status: '可接入',
  },
  {
    name: '团队通知',
    desc: '将摘要发送到协作频道，并生成后续沟通草稿。',
    status: '可接入',
  },
];

const defaultSystemPrompt = '你是一个专业、可靠、简洁的中文 AI 助手。';

const getBlockText = (block: ChatContentBlock) => {
  if (typeof block.text === 'string' && block.text.trim()) {
    return block.text.trim();
  }
  if (typeof block.thinking === 'string' && block.thinking.trim()) {
    return block.thinking.trim();
  }
  if (typeof block.content === 'string' && block.content.trim()) {
    return block.content.trim();
  }
  return '';
};

const getMessageText = (message: ChatMessage) => {
  return message.content
    .map((block) => getBlockText(block))
    .filter(Boolean)
    .join('\n')
    .trim();
};

const getMessagePreview = (message: ChatMessage) => {
  const text = getMessageText(message);
  if (!text) {
    return message.role === 'assistant' ? '助手回复' : '新对话';
  }
  return text.slice(0, 24);
};

const formatToolInput = (input: unknown) => {
  if (!input) {
    return '';
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch (error) {
    return String(error);
  }
};

const createConversationID = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createRequestID = () => `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createConversationTitle = (messages: ChatMessage[]) => {
  const userMessage = messages.find((item) => item.role === 'user');
  if (!userMessage) {
    return '新对话';
  }

  const base = getMessageText(userMessage)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[，。！？；：、“”‘’【】（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) {
    return '新对话';
  }
  return base.slice(0, 18);
};

const createEmptyConversation = (): ChatConversation => {
  const now = new Date().toISOString();
  return {
    id: createConversationID(),
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
};

const buildConversationPatch = (conversation: ChatConversation, messages: ChatMessage[], title?: string): ChatConversation => ({
  ...conversation,
  messages,
  title: title ?? createConversationTitle(messages),
  updatedAt: new Date().toISOString(),
});

const upsertConversation = (conversations: ChatConversation[], nextConversation: ChatConversation) => {
  const index = conversations.findIndex((item) => item.id === nextConversation.id);
  if (index === -1) {
    return [nextConversation, ...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const next = [...conversations];
  next[index] = nextConversation;
  return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const escapeMarkdownHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const renderMarkdownHTML = (value: string) => {
  const html = marked.parse(escapeMarkdownHTML(value), {
    async: false,
    breaks: true,
    gfm: true,
  });
  return typeof html === 'string' ? sanitizeMarkdownHTML(html) : '';
};

const sanitizeMarkdownHTML = (html: string) => {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      if (attribute.name.startsWith('on')) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  template.content.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const isSafeLink = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('#');
    if (!isSafeLink) {
      link.removeAttribute('href');
      return;
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer');
  });

  template.content.querySelectorAll('img').forEach((image) => {
    image.remove();
  });

  return template.innerHTML;
};

const createAnimatedTextKey = (conversationID: string, messageIndex: number, blockIndex: number) =>
  `${conversationID}:${messageIndex}:${blockIndex}`;

export default function App() {
  const [loginMode, setLoginMode] = useState<LoginMode>('password');
  const [page, setPage] = useState<WorkspacePage>('chat');
  const [message, setMessage] = useState('正在校验登录状态...');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [remember, setRemember] = useState(true);
  const [booting, setBooting] = useState(true);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [form, setForm] = useState({ account: '', password: '' });
  const [otpForm, setOtpForm] = useState({ email: '', code: '' });
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [errors, setErrors] = useState<{ account?: string; password?: string }>({});
  const [otpErrors, setOtpErrors] = useState<{ email?: string; code?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [composer, setComposer] = useState('');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationID, setActiveConversationID] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [llmModel, setLLMModel] = useState('MiniMax-M2.7');
  const [editingConversationID, setEditingConversationID] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [animatedMarkdownByKey, setAnimatedMarkdownByKey] = useState<Record<string, string>>({});
  const refreshTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const streamRequestIDRef = useRef('');
  const streamingConversationIDRef = useRef('');
  const animatedMarkdownTargetsRef = useRef<Record<string, string>>({});
  const animatedMarkdownTimersRef = useRef<Record<string, number>>({});

  const scheduleMarkdownAnimation = (key: string) => {
    if (animatedMarkdownTimersRef.current[key]) {
      return;
    }

    const tick = () => {
      let shouldContinue = false;
      setAnimatedMarkdownByKey((current) => {
        const target = animatedMarkdownTargetsRef.current[key] || '';
        const previous = current[key] || '';
        if (previous === target) {
          return current;
        }

        const gap = target.length - previous.length;
        const step = Math.min(Math.max(Math.ceil(Math.abs(gap) / 12), 1), 8);
        const nextValue = target.startsWith(previous)
          ? target.slice(0, previous.length + step)
          : target;

        shouldContinue = nextValue !== target;
        return {
          ...current,
          [key]: nextValue,
        };
      });

      if (shouldContinue) {
        animatedMarkdownTimersRef.current[key] = window.setTimeout(tick, 18);
        return;
      }
      delete animatedMarkdownTimersRef.current[key];
    };

    animatedMarkdownTimersRef.current[key] = window.setTimeout(tick, 18);
  };

  const redirectToLoginForExpiredSession = (tip?: string) => {
    setLoginResponse(null);
    setSubmitState('error');
    setMessage(tip || '登录已过期，请重新登录');
    setComposer('');
    setPage('chat');
    setUserMenuOpen(false);
  };

  const persistConversations = async (nextConversations: ChatConversation[]) => {
    setConversations(nextConversations);
    try {
      await runtimeApp().SaveChatConversations(nextConversations);
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '保存对话失败');
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const [model, storedConversations] = await Promise.all([
          runtimeApp().GetDefaultLLMModel(),
          runtimeApp().LoadChatConversations(),
        ]);
        if (!active) {
          return;
        }
        setLLMModel(model || 'MiniMax-M2.7');
        setConversations(storedConversations || []);
        if (storedConversations?.length) {
          setActiveConversationID(storedConversations[0].id);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setSubmitState('error');
        setMessage(error instanceof Error ? error.message : '初始化失败');
      }

      try {
        const response = await runtimeApp().RestoreSession();
        if (!active) {
          return;
        }
        if (!response?.data?.user) {
          return;
        }
        setLoginResponse(response);
        setSubmitState('success');
        setMessage('工作区已恢复。');
      } catch (error) {
        if (!active) {
          return;
        }
        redirectToLoginForExpiredSession();
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    Object.values(animatedMarkdownTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    animatedMarkdownTimersRef.current = {};
  }, []);

  useEffect(() => {
    const offChunk = EventsOn('chat_stream_chunk', (...args: unknown[]) => {
      const payload = args[0] as ChatStreamChunkPayload | undefined;
      if (!payload || payload.requestId !== streamRequestIDRef.current) {
        return;
      }

      setConversations((current) => {
        const conversationID = streamingConversationIDRef.current;
        const conversation = current.find((item) => item.id === conversationID);
        if (!conversation) {
          return current;
        }

        const messages = [...conversation.messages];
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
          messages.push({ role: 'assistant', content: [] });
        }

        const assistantMessage = messages[messages.length - 1];
        const content = [...assistantMessage.content];
        while (content.length <= payload.index) {
          content.push({ type: '' });
        }
        content[payload.index] = payload.block;
        messages[messages.length - 1] = {
          ...assistantMessage,
          content,
        };

        return upsertConversation(current, buildConversationPatch(conversation, messages, conversation.title));
      });
    });

    const offComplete = EventsOn('chat_stream_complete', (...args: unknown[]) => {
      const payload = args[0] as ChatStreamCompletePayload | undefined;
      if (!payload || payload.requestId !== streamRequestIDRef.current) {
        return;
      }

      streamRequestIDRef.current = '';
      setIsChatting(false);
      setConversations((current) => {
        const conversationID = streamingConversationIDRef.current;
        const conversation = current.find((item) => item.id === conversationID);
        if (!conversation) {
          return current;
        }

        const messages = [...conversation.messages];
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: Array.isArray(payload.response.content) ? payload.response.content : [],
        };

        if (messages.length > 0 && messages[messages.length - 1]?.role === 'assistant') {
          messages[messages.length - 1] = assistantMessage;
        } else {
          messages.push(assistantMessage);
        }

        const autoTitle = conversation.title === '新对话' ? undefined : conversation.title;
        const nextConversation = buildConversationPatch(conversation, messages, autoTitle);
        const nextConversations = upsertConversation(current, nextConversation);
        void runtimeApp().SaveChatConversations(nextConversations);
        return nextConversations;
      });

      setSubmitState('success');
      setMessage('对话已更新。');
    });

    return () => {
      offChunk();
      offComplete();
    };
  }, []);

  useEffect(() => {
    if (!isChatting) {
      Object.values(animatedMarkdownTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      animatedMarkdownTimersRef.current = {};
      animatedMarkdownTargetsRef.current = {};
      setAnimatedMarkdownByKey({});
      return;
    }

    const conversationID = streamingConversationIDRef.current || activeConversationID;
    const conversation = conversations.find((item) => item.id === conversationID);
    if (!conversation) {
      return;
    }

    const messageIndex = conversation.messages.length - 1;
    const assistantMessage = conversation.messages[messageIndex];
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      return;
    }

    const activeKeys = new Set<string>();
    const nextTargets: Record<string, string> = {};
    assistantMessage.content.forEach((block, blockIndex) => {
      if (block.type !== 'text') {
        return;
      }
      const key = createAnimatedTextKey(conversation.id, messageIndex, blockIndex);
      activeKeys.add(key);
      nextTargets[key] = getBlockText(block);
      animatedMarkdownTargetsRef.current[key] = nextTargets[key];
    });

    setAnimatedMarkdownByKey((current) => {
      let changed = false;
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (!activeKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      });
      activeKeys.forEach((key) => {
        if (next[key] === undefined) {
          next[key] = '';
          changed = true;
        }
      });
      return changed ? next : current;
    });

    activeKeys.forEach((key) => scheduleMarkdownAnimation(key));
  }, [activeConversationID, conversations, isChatting]);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [conversations, activeConversationID, isChatting]);

  useEffect(() => {
    if (otpCountdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setOtpCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const expiresIn = loginResponse?.data?.expiresIn;
    const refreshToken = loginResponse?.data?.refreshToken;
    if (!loginResponse?.data?.accessToken || !refreshToken) {
      return;
    }

    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        setIsRefreshing(true);
        const response = await runtimeApp().RefreshSession('ops_console_web');
        setLoginResponse(response);
        setSubmitState('success');
        setMessage('会话已刷新。');
      } catch (error) {
        void error;
        redirectToLoginForExpiredSession();
      } finally {
        setIsRefreshing(false);
      }
    }, expiresIn ? Math.max((expiresIn - 60) * 1000, 15000) : 5 * 60 * 1000);

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [loginResponse]);

  const currentUser = loginResponse?.data?.user;
  const isLoggedIn = Boolean(currentUser);
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationID) || null,
    [conversations, activeConversationID],
  );
  const chatMessages = activeConversation?.messages ?? [];
  const recentChats = useMemo(() => conversations.slice(0, 6), [conversations]);
  const canLogin = useMemo(() => form.account.trim() !== '' && form.password.trim() !== '', [form]);
  const isSessionChecking = booting && !isLoggedIn;
  const canSendMessage = composer.trim() !== '' && !isChatting && !isSessionChecking;
  const latestUserMessage = useMemo(() => {
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      if (chatMessages[index]?.role === 'user') {
        return chatMessages[index];
      }
    }
    return null;
  }, [chatMessages]);

  const ensureConversation = async () => {
    if (activeConversation) {
      return activeConversation;
    }
    const conversation = createEmptyConversation();
    const nextConversations = upsertConversation(conversations, conversation);
    setActiveConversationID(conversation.id);
    await persistConversations(nextConversations);
    return conversation;
  };

  const copyText = async (text: string) => {
    if (!text.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setSubmitState('success');
      setMessage('内容已复制。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '复制失败');
    }
  };

  const validate = () => {
    const next: { account?: string; password?: string } = {};
    if (!form.account.trim()) {
      next.account = '请输入账号';
    }
    if (!form.password.trim()) {
      next.password = '请输入密码';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async (event: Event) => {
    event.preventDefault();
    if (!validate()) {
      setSubmitState('error');
      setMessage('请检查必填项。');
      return;
    }

    setSubmitState('submitting');
    setMessage('正在登录...');
    try {
      const response = await runtimeApp().Login(form.account.trim(), form.password.trim(), remember);
      setLoginResponse(response);
      setForm((prev) => ({ ...prev, password: '' }));
      setSubmitState('success');
      setMessage(response.msg || '欢迎回来。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '登录失败');
    }
  };

  const validateOTP = () => {
    const next: { email?: string; code?: string } = {};
    if (!otpForm.email.trim()) {
      next.email = '请输入邮箱';
    }
    if (!otpForm.code.trim()) {
      next.code = '请输入验证码';
    }
    setOtpErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleOTPLogin = async (event: Event) => {
    event.preventDefault();
    if (!validateOTP()) {
      setSubmitState('error');
      setMessage('请检查必填项。');
      return;
    }

    setSubmitState('submitting');
    setMessage('正在登录...');
    try {
      const response = await runtimeApp().LoginByEmailCode(otpForm.email.trim(), otpForm.code.trim(), 'ops_console_web', remember);
      setLoginResponse(response);
      setOtpForm((prev) => ({ ...prev, code: '' }));
      setSubmitState('success');
      setMessage(response.msg || '欢迎回来。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '登录失败');
    }
  };

  const handleSendOTPCode = async () => {
    const email = otpForm.email.trim();
    if (!email) {
      setOtpErrors({ email: '请输入邮箱' });
      setSubmitState('error');
      setMessage('请检查必填项。');
      return;
    }

    setSubmitState('submitting');
    setMessage('正在发送验证码...');
    try {
      await runtimeApp().SendEmailCode(email, 'login');
      setOtpCountdown(60);
      setSubmitState('success');
      setMessage('验证码已发送。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '验证码发送失败');
    }
  };

  const handleLogout = async () => {
    setSubmitState('submitting');
    setMessage('正在退出登录...');
    try {
      await runtimeApp().Logout();
      setLoginResponse(null);
      setComposer('');
      setPage('chat');
      setUserMenuOpen(false);
      setSubmitState('success');
      setMessage('已退出登录。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '退出登录失败');
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setSubmitState('submitting');
    setMessage('正在刷新会话...');
    try {
      const response = await runtimeApp().RefreshSession('ops_console_web');
      setLoginResponse(response);
      setSubmitState('success');
      setMessage(response.msg || '会话已刷新。');
    } catch (error) {
      void error;
      redirectToLoginForExpiredSession();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openConversation = (conversationID: string) => {
    setActiveConversationID(conversationID);
    setPage('chat');
    setUserMenuOpen(false);
  };

  const createNewConversation = async () => {
    const conversation = createEmptyConversation();
    const nextConversations = upsertConversation(conversations, conversation);
    setActiveConversationID(conversation.id);
    setPage('chat');
    setComposer('');
    setEditingConversationID('');
    setUserMenuOpen(false);
    await persistConversations(nextConversations);
  };

  const renameConversation = async (conversationID: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setEditingConversationID('');
      setEditingTitle('');
      return;
    }
    const conversation = conversations.find((item) => item.id === conversationID);
    if (!conversation) {
      return;
    }
    const nextConversation = {
      ...conversation,
      title: trimmedTitle,
      updatedAt: new Date().toISOString(),
    };
    setEditingConversationID('');
    setEditingTitle('');
    await persistConversations(upsertConversation(conversations, nextConversation));
  };

  const deleteConversation = async (conversationID: string) => {
    const target = conversations.find((item) => item.id === conversationID);
    if (!target) {
      return;
    }

    if (streamingConversationIDRef.current === conversationID && streamRequestIDRef.current) {
      try {
        await runtimeApp().StopChatStream(streamRequestIDRef.current);
      } catch {
        // ignore stop error before deletion
      }
      streamRequestIDRef.current = '';
      setIsChatting(false);
    }

    const nextConversations = conversations.filter((item) => item.id !== conversationID);
    if (activeConversationID === conversationID) {
      setActiveConversationID(nextConversations[0]?.id || '');
      setPage(nextConversations.length > 0 ? 'chat' : 'library');
    }
    await persistConversations(nextConversations);
    setSubmitState('success');
    setMessage('对话已删除。');
  };

  const stopCurrentStream = async () => {
    if (!streamRequestIDRef.current) {
      return;
    }
    try {
      await runtimeApp().StopChatStream(streamRequestIDRef.current);
      streamRequestIDRef.current = '';
      setIsChatting(false);
      setSubmitState('success');
      setMessage('已停止生成。');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : '停止生成失败');
    }
  };

  const sendChatMessage = async (rawText?: string, baseConversation?: ChatConversation) => {
    const text = (rawText ?? composer).trim();
    if (!text || isChatting) {
      return;
    }

    const conversation = baseConversation ?? (await ensureConversation());
    const userMessage: ChatMessage = {
      role: 'user',
      content: [{ type: 'text', text }],
    };

    const pendingAssistantMessage: ChatMessage = {
      role: 'assistant',
      content: [],
    };

    const requestID = createRequestID();
    streamRequestIDRef.current = requestID;
    streamingConversationIDRef.current = conversation.id;

    const nextMessages = [...conversation.messages, userMessage, pendingAssistantMessage];
    const nextConversation = buildConversationPatch(conversation, nextMessages, conversation.title === '新对话' ? undefined : conversation.title);
    const nextConversations = upsertConversation(conversations, nextConversation);

    setActiveConversationID(conversation.id);
    setComposer('');
    setPage('chat');
    setIsChatting(true);
    await persistConversations(nextConversations);

    try {
      await runtimeApp().StartChatStream(requestID, [...conversation.messages, userMessage], defaultSystemPrompt);
    } catch (error) {
      streamRequestIDRef.current = '';
      setIsChatting(false);
      const errorMessage = error instanceof Error ? error.message : '消息发送失败';
      setSubmitState('error');
      setMessage(errorMessage);

      const rollbackConversation = buildConversationPatch(conversation, [...conversation.messages, userMessage], conversation.title);
      await persistConversations(upsertConversation(nextConversations, rollbackConversation));
    }
  };

  const retryLastPrompt = async () => {
    if (!activeConversation || isChatting) {
      return;
    }

    const messages = [...activeConversation.messages];
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex === -1) {
      return;
    }

    const prompt = getMessageText(messages[lastUserIndex]);
    if (!prompt) {
      return;
    }

    const trimmedConversation = buildConversationPatch(activeConversation, messages.slice(0, lastUserIndex), activeConversation.title);
    await persistConversations(upsertConversation(conversations, trimmedConversation));
    await sendChatMessage(prompt, trimmedConversation);
  };

  const handleComposerKeyDown = async (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }
    event.preventDefault();
    await sendChatMessage();
  };

  const renderLogin = () => (
    <main className="login-page">
      <section className="login-shell">
        <section className="login-brand" style={{ backgroundImage: `url(${loginBackground})` }} aria-hidden="true" />

        <section className="login-panel">
          <div className="login-card">
            <div className="login-heading">
              <h2>欢迎回来</h2>
            </div>

            <div className="login-tabs">
              <button
                className={`login-tab ${loginMode === 'password' ? 'login-tab-active' : ''}`}
                type="button"
                onClick={() => setLoginMode('password')}
              >
                密码登录
              </button>
              <button
                className={`login-tab ${loginMode === 'otp' ? 'login-tab-active' : ''}`}
                type="button"
                onClick={() => setLoginMode('otp')}
              >
                验证码登录
              </button>
            </div>

            {loginMode === 'password' ? (
              <form className="login-form" onSubmit={handleLogin}>
                <label className="field">
                  <span>邮箱地址</span>
                  <div className="field-box">
                    <i>✉</i>
                    <input
                      type="text"
                      placeholder="name@company.com"
                      value={form.account}
                      onInput={(event) => {
                        setErrors((prev) => ({ ...prev, account: undefined }));
                        setForm((prev) => ({ ...prev, account: (event.target as HTMLInputElement).value }));
                      }}
                    />
                  </div>
                  {errors.account ? <em>{errors.account}</em> : null}
                </label>

                <label className="field">
                  <div className="field-inline">
                    <span>密码</span>
                    <button className="text-link" type="button">
                      忘记密码？
                    </button>
                  </div>
                  <div className="field-box">
                    <i>⌑</i>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onInput={(event) => {
                        setErrors((prev) => ({ ...prev, password: undefined }));
                        setForm((prev) => ({ ...prev, password: (event.target as HTMLInputElement).value }));
                      }}
                    />
                    <button className="icon-button" type="button" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                  {errors.password ? <em>{errors.password}</em> : null}
                </label>

                <button className="primary-button" type="submit" disabled={!canLogin || booting || submitState === 'submitting'}>
                  {booting ? '加载中...' : submitState === 'submitting' ? '登录中...' : '登录'}
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleOTPLogin}>
                <label className="field">
                  <span>邮箱地址</span>
                  <div className="field-box">
                    <i>✉</i>
                    <input
                      type="text"
                      placeholder="name@company.com"
                      value={otpForm.email}
                      onInput={(event) => {
                        setOtpErrors((prev) => ({ ...prev, email: undefined }));
                        setOtpForm((prev) => ({ ...prev, email: (event.target as HTMLInputElement).value }));
                      }}
                    />
                  </div>
                  {otpErrors.email ? <em>{otpErrors.email}</em> : null}
                </label>

                <button className="text-link send-code-link" type="button" disabled={otpCountdown > 0} onClick={handleSendOTPCode}>
                  {otpCountdown > 0 ? `${otpCountdown}s 后重发` : '发送验证码'}
                </button>

                <label className="field">
                  <span>验证码</span>
                  <div className="field-box otp-box">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={otpForm.code}
                      onInput={(event) => {
                        setOtpErrors((prev) => ({ ...prev, code: undefined }));
                        setOtpForm((prev) => ({ ...prev, code: (event.target as HTMLInputElement).value.replace(/\D/g, '') }));
                      }}
                    />
                  </div>
                  {otpErrors.code ? <em>{otpErrors.code}</em> : null}
                </label>

                <button className="primary-button" type="submit" disabled={booting || submitState === 'submitting'}>
                  {booting ? '加载中...' : submitState === 'submitting' ? '登录中...' : '登录'}
                </button>
              </form>
            )}

            {submitState !== 'idle' ? <div className={`status-note status-${submitState}`}>{message}</div> : null}
          </div>
        </section>
      </section>
      <div className="login-blur login-blur-top" />
      <div className="login-blur login-blur-bottom" />
    </main>
  );

  const renderAssistantBlocks = (blocks: ChatContentBlock[], streaming = false, animationBaseKey = '') => (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${block.id || index}`;

        if (block.type === 'text') {
          const animationKey = animationBaseKey ? `${animationBaseKey}:${index}` : '';
          const markdown = streaming && animationKey
            ? animatedMarkdownByKey[animationKey] || ''
            : getBlockText(block);

          return (
            <div
              className={`chat-text markdown-body ${streaming ? 'chat-text-streaming' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdownHTML(markdown) }}
              key={key}
            />
          );
        }

        if (block.type === 'thinking') {
          return (
            <details className="thinking-card" key={key}>
              <summary>查看思考过程</summary>
              <pre>{getBlockText(block)}</pre>
            </details>
          );
        }

        if (block.type === 'tool_use') {
          return (
            <div className="tool-card" key={key}>
              <strong>工具调用：{block.name || block.id || '未命名工具'}</strong>
              {block.input ? <pre>{formatToolInput(block.input)}</pre> : null}
            </div>
          );
        }

        return (
          <div className="tool-card" key={key}>
            <strong>内容块：{block.type || '未知类型'}</strong>
            <pre>{formatToolInput(block)}</pre>
          </div>
        );
      })}
    </>
  );

  const renderChat = () => (
    <>
      <div className="workspace-scroll" ref={chatScrollRef}>
        <section className="chat-header-card">
          <div>
            <span>当前会话</span>
            <h2>{activeConversation?.title || '新对话'}</h2>
            <p>{activeConversation ? `更新于 ${formatDateTime(activeConversation.updatedAt)}` : isSessionChecking ? '正在校验登录状态，请稍候。' : '开始一段新的真实对话。'}</p>
          </div>
          <div className="chat-header-actions">
            <button className="outline-button" type="button" onClick={() => void createNewConversation()}>新建会话</button>
            <button className="outline-button" type="button" onClick={() => void retryLastPrompt()} disabled={!latestUserMessage || isChatting}>重新回答</button>
            <button className="outline-button" type="button" onClick={() => void stopCurrentStream()} disabled={!isChatting}>停止生成</button>
          </div>
        </section>

        {chatMessages.length === 0 ? (
          <section className="chat-welcome-card">
            <span>已接入 {llmModel}</span>
            <h2>开始一段真实对话</h2>
            <p>{isSessionChecking ? '正在恢复本地会话并校验 token，有效后将直接进入工作区。' : '当前支持流式输出、复制消息、重新回答与本地持久化，关闭应用后也能继续查看历史会话。'}</p>
          </section>
        ) : null}

        {chatMessages.map((item, index) => {
          const text = getMessageText(item);
          const isLastAssistant = item.role === 'assistant' && index === chatMessages.length - 1;
          if (item.role === 'user') {
            return (
              <div className="chat-thread" key={`message-${index}`}>
                <div className="chat-block user-block">
                  <div className="user-message-shell">
                    <div className="user-bubble">{text}</div>
                    <div className="message-actions user-actions">
                      <button type="button" onClick={() => void copyText(text)}>复制</button>
                    </div>
                  </div>
                  <div className="user-avatar" />
                </div>
              </div>
            );
          }

          return (
            <div className="chat-thread" key={`message-${index}`}>
              <div className="chat-block assistant-block">
                <div className="chat-avatar assistant-avatar">☁</div>
                <div className="chat-copy">
                  <div className="assistant-headline">
                    <p className="assistant-name">智能助手</p>
                    <div className="message-actions">
                      <button type="button" onClick={() => void copyText(text)} disabled={!text}>复制</button>
                      <button type="button" onClick={() => void retryLastPrompt()} disabled={isChatting || !latestUserMessage || !isLastAssistant}>重试</button>
                    </div>
                  </div>
                  {item.content.length > 0 ? renderAssistantBlocks(
                    item.content,
                    isChatting && isLastAssistant,
                    activeConversation ? `${activeConversation.id}:${index}` : '',
                  ) : (
                    <div className="chat-text typing-text chat-text-streaming">
                      <p className="typing-paragraph">正在生成回复，请稍候...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="composer-shell">
        <div className="composer-card">
          <textarea
            placeholder={isSessionChecking ? '正在校验登录状态...' : '请输入你的问题，Enter 发送，Shift + Enter 换行'}
            value={composer}
            onInput={(event) => setComposer((event.target as HTMLTextAreaElement).value)}
            onKeyDown={(event) => {
              void handleComposerKeyDown(event as KeyboardEvent);
            }}
            disabled={isSessionChecking}
          />
          <div className="composer-toolbar">
            <div className="composer-actions">
              <button type="button" disabled>
                ⌁
              </button>
              <button type="button" disabled>
                ◉
              </button>
              <span className="composer-divider" />
              <button className="plugin-pill" type="button" disabled>
                当前模型：{llmModel}
              </button>
            </div>
            <div className="composer-submit-group">
              {isChatting ? (
                <button className="outline-button compact" type="button" onClick={() => void stopCurrentStream()}>
                  停止
                </button>
              ) : null}
              <button className="send-button" type="button" disabled={!canSendMessage} onClick={() => void sendChatMessage()}>
                ➤
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderLibrary = () => (
    <div className="page-shell history-shell">
      <header className="page-header">
        <div>
          <h1>历史对话</h1>
          <p>管理本地持久化的聊天记录，支持打开、重命名和删除。</p>
        </div>
        <button className="outline-button" type="button" onClick={() => void createNewConversation()}>
          新建会话
        </button>
      </header>

      <div className="history-grid">
        {conversations.length > 0 ? conversations.map((conversation) => {
          const preview = getMessagePreview(conversation.messages.find((item) => item.role === 'assistant') || conversation.messages[0] || { role: 'user', content: [] });
          const isEditing = editingConversationID === conversation.id;
          return (
            <article className="history-card" key={conversation.id}>
              <div className="history-card-top">
                <span>{formatDateTime(conversation.updatedAt)}</span>
                <strong>{conversation.messages.length} 条消息</strong>
              </div>
              {isEditing ? (
                <div className="history-edit-row">
                  <input
                    value={editingTitle}
                    onInput={(event) => setEditingTitle((event.target as HTMLInputElement).value)}
                    onKeyDown={(event) => {
                      if ((event as KeyboardEvent).key === 'Enter') {
                        void renameConversation(conversation.id, editingTitle);
                      }
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={() => void renameConversation(conversation.id, editingTitle)}>保存</button>
                </div>
              ) : (
                <h3>{conversation.title}</h3>
              )}
              <p>{preview || '暂无内容'}</p>
              <div className="history-card-actions">
                <button type="button" onClick={() => openConversation(conversation.id)}>打开</button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingConversationID(conversation.id);
                    setEditingTitle(conversation.title);
                  }}
                >
                  重命名
                </button>
                <button type="button" onClick={() => void deleteConversation(conversation.id)}>删除</button>
              </div>
            </article>
          );
        }) : (
          <section className="contribute-card">
            <h2>还没有历史对话</h2>
            <p>创建一段新会话后，聊天记录会自动保存在本地，并在这里集中管理。</p>
          </section>
        )}
      </div>
    </div>
  );

  const renderPlugins = () => (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>插件中心</h1>
          <p>管理已启用的集成，并扩展你的工作区能力。</p>
        </div>
      </header>

      <section className="hero-plugin">
        <div>
          <span>当前工作区</span>
          <h2>研究与执行栈</h2>
          <p>当前工作区可以接入更多能力组件，用于资料整合、内容生成与自动化分析。</p>
        </div>
        <button className="primary-button compact" type="button">
          添加插件
        </button>
      </section>

      <div className="plugin-grid">
        {plugins.map((plugin) => (
          <article className="plugin-card" key={plugin.name}>
            <div className="plugin-topline">
              <h3>{plugin.name}</h3>
              <span>{plugin.status}</span>
            </div>
            <p>{plugin.desc}</p>
            <button className="outline-button" type="button">
              {plugin.status === '已连接' ? '管理' : '连接'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => {
    const settingsGroups = [
      {
        title: '工作空间',
        items: [`默认模型：${llmModel}`, '语言：中文', '主题：浅色'],
      },
      {
        title: '通知',
        items: ['桌面提醒已开启', '工作区提及汇总已开启', '错误上报已开启'],
      },
      {
        title: '安全',
        items: ['会话恢复已开启', 'Token 自动刷新已开启', '本地会话已加固'],
      },
    ];

    return (
      <div className="page-shell">
        <header className="page-header">
          <div>
            <h1>设置</h1>
            <p>管理你的工作区配置和个人偏好。</p>
          </div>
          <button className="outline-button" type="button" onClick={handleManualRefresh}>
            {isRefreshing ? '刷新中...' : '刷新会话'}
          </button>
        </header>

        <div className="settings-grid">
          {settingsGroups.map((group) => (
            <section className="settings-card" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  };

  if (!isLoggedIn && !booting) {
    return renderLogin();
  }

  return (
    <main className="workspace-page">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark filled">☁</div>
          <div>
            <h1>MindNexus</h1>
            <p>企业级 AI</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className="sidebar-link sidebar-link-active"
            type="button"
            onClick={() => {
              void createNewConversation();
            }}
          >
            <span>+</span>
            <strong>新建会话</strong>
          </button>
        </nav>

        <div className="recent-panel">
          <h3>最近对话</h3>
          {recentChats.length > 0 ? (
            recentChats.map((item) => (
              <button
                className={`recent-item ${item.id === activeConversationID ? 'recent-item-active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => openConversation(item.id)}
              >
                <span>◻</span>
                <strong>{item.title}</strong>
              </button>
            ))
          ) : (
            <p className="recent-empty">暂无最近对话</p>
          )}
        </div>

        <div className="sidebar-footer">
          {userMenuOpen ? (
            <div className="sidebar-user-menu">
              <button type="button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          ) : null}
          <button
            className="sidebar-user-trigger"
            type="button"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((open) => !open)}
          >
            <div className="user-chip-avatar" />
            <strong>{currentUser?.displayName || currentUser?.account || '工作区'}</strong>
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        {isSessionChecking ? (
          <div className="workspace-overlay" aria-live="polite">
            <div className="workspace-overlay-card">
              <strong>正在校验登录状态</strong>
              <p>正在恢复本地会话并验证 token，有效后将直接进入首页。</p>
            </div>
          </div>
        ) : null}
        <header className="topbar">
          <div className="topbar-title">
            <span>当前对话</span>
            <strong>{activeConversation?.title || '新对话'}</strong>
          </div>

        </header>

        {renderChat()}
      </section>
    </main>
  );
}
