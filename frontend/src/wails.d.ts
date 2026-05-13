export {};

type WailsUser = {
  userId?: string;
  account?: string;
  displayName?: string;
  email?: string;
  mobile?: string;
};

type WailsLoginData = {
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  scope?: string;
  sessionId?: string;
  user?: WailsUser;
} | null;

type WailsLoginResponse = {
  code: number;
  msg: string;
  uuid: string;
  data?: WailsLoginData;
};

type WailsRegisterResponse = {
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

type WailsBaseResponse = {
  code: number;
  msg: string;
  uuid: string;
  data?: {
    message?: string;
  } | null;
};

type WailsChatContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
};

type WailsChatMessage = {
  role: 'user' | 'assistant';
  content: WailsChatContentBlock[];
};

type WailsChatResponse = {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content: WailsChatContentBlock[];
  stop_reason?: string;
  stop_sequence?: string;
};

type WailsChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: WailsChatMessage[];
};

declare global {
  interface Window {
    go?: {
      main?: {
        App?: {
          Login: (account: string, password: string, remember: boolean) => Promise<WailsLoginResponse>;
          SendEmailCode: (email: string, scene: string) => Promise<WailsBaseResponse>;
          Register: (
            account: string,
            password: string,
            displayName: string,
            email: string,
            mobile: string,
          ) => Promise<WailsRegisterResponse>;
          RegisterByEmail: (
            email: string,
            code: string,
            displayName: string,
            password: string,
          ) => Promise<WailsBaseResponse>;
          LoginByEmailCode: (
            email: string,
            code: string,
            clientId: string,
            remember: boolean,
          ) => Promise<WailsLoginResponse>;
          RestoreSession: () => Promise<WailsLoginResponse | null>;
          RefreshSession: (clientId: string) => Promise<WailsLoginResponse>;
          Logout: () => Promise<WailsBaseResponse>;
          ClearSession: () => Promise<void>;
          GetDefaultClientID: () => Promise<string>;
          GetDefaultLLMModel: () => Promise<string>;
          Chat: (messages: WailsChatMessage[], systemPrompt: string) => Promise<WailsChatResponse>;
          StartChatStream: (requestId: string, messages: WailsChatMessage[], systemPrompt: string) => Promise<void>;
          StopChatStream: (requestId: string) => Promise<void>;
          LoadChatConversations: () => Promise<WailsChatConversation[]>;
          SaveChatConversations: (conversations: WailsChatConversation[]) => Promise<void>;
        };
      };
    };
  }
}
