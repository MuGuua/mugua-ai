package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const defaultClientID = "ops_console_web"
const defaultAPIBaseURL = "http://38.76.179.44:8081"
const defaultLLMBaseURL = "https://api.minimaxi.com/anthropic"
const defaultLLMModel = "MiniMax-M2.7"
const defaultLLMAPIKey = "sk-api-DfqNz2QuBKWDL9qPt30kQ2ndeCjSkbQ1ID2cSTG0lhRRBAFQpARLc7PYn5tXJPFfIkqN_MO3d0RQQ8FnKySaKmNhSVIF96W4d11a0nZh7lxmDEKQ8yol7qM"

const rememberedSessionDuration = 7 * 24 * time.Hour

type App struct {
	ctx        context.Context
	client     *http.Client
	apiBaseURL string
	llmBaseURL string
	llmAPIKey  string
	llmModel   string
	streamMu   sync.Mutex
	streams    map[string]context.CancelFunc
}

type BaseResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	UUID string `json:"uuid"`
}

type MessageData struct {
	Message string `json:"message"`
}

type MessageResponse struct {
	Code int          `json:"code"`
	Msg  string       `json:"msg"`
	UUID string       `json:"uuid"`
	Data *MessageData `json:"data"`
}

type EmailCodeRequest struct {
	Email string `json:"email"`
	Scene string `json:"scene"`
}

type OpenEmailRegisterRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

type OpenEmailTokenRequest struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	ClientID string `json:"clientId"`
}

type OpenRegisterRequest struct {
	Account     string `json:"account"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Mobile      string `json:"mobile"`
}

type OpenRegisterData struct {
	UserID      string `json:"userId"`
	Account     string `json:"account"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
}

type OpenRegisterResponse struct {
	Code int               `json:"code"`
	Msg  string            `json:"msg"`
	UUID string            `json:"uuid"`
	Data *OpenRegisterData `json:"data"`
}

type OpenTokenRequest struct {
	Account  string `json:"account"`
	Password string `json:"password"`
}

type OpenTokenUser struct {
	UserID      string `json:"userId"`
	Account     string `json:"account"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Mobile      string `json:"mobile"`
}

type OpenTokenData struct {
	AccessToken      string         `json:"accessToken"`
	TokenType        string         `json:"tokenType"`
	ExpiresIn        int64          `json:"expiresIn"`
	RefreshToken     string         `json:"refreshToken"`
	RefreshExpiresIn int64          `json:"refreshExpiresIn"`
	Scope            string         `json:"scope"`
	SessionID        string         `json:"sessionId"`
	User             *OpenTokenUser `json:"user"`
}

type OpenTokenResponse struct {
	Code int            `json:"code"`
	Msg  string         `json:"msg"`
	UUID string         `json:"uuid"`
	Data *OpenTokenData `json:"data"`
}

type OpenRefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
	ClientID     string `json:"clientId"`
}

type OpenRefreshData struct {
	AccessToken      string `json:"accessToken"`
	TokenType        string `json:"tokenType"`
	ExpiresIn        int64  `json:"expiresIn"`
	RefreshToken     string `json:"refreshToken"`
	RefreshExpiresIn int64  `json:"refreshExpiresIn"`
	Scope            string `json:"scope"`
}

type OpenRefreshResponse struct {
	Code int              `json:"code"`
	Msg  string           `json:"msg"`
	UUID string           `json:"uuid"`
	Data *OpenRefreshData `json:"data"`
}

type OpenUserProfile struct {
	UserID      string   `json:"userId"`
	Account     string   `json:"account"`
	DisplayName string   `json:"displayName"`
	Email       string   `json:"email"`
	Mobile      string   `json:"mobile"`
	Status      string   `json:"status"`
	SessionID   string   `json:"sessionId"`
	Scope       []string `json:"scope"`
}

type OpenMeResponse struct {
	Code int              `json:"code"`
	Msg  string           `json:"msg"`
	UUID string           `json:"uuid"`
	Data *OpenUserProfile `json:"data"`
}

type OpenLogoutRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type SessionState struct {
	Remembered bool               `json:"remembered"`
	CreatedAt  string             `json:"createdAt,omitempty"`
	ExpiresAt  string             `json:"expiresAt,omitempty"`
	Response   *OpenTokenResponse `json:"response"`
}

type ChatContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	Thinking  string          `json:"thinking,omitempty"`
	Signature string          `json:"signature,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
}

type ChatMessage struct {
	Role    string             `json:"role"`
	Content []ChatContentBlock `json:"content"`
}

type llmRequestMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type ChatConversation struct {
	ID        string        `json:"id"`
	Title     string        `json:"title"`
	CreatedAt string        `json:"createdAt"`
	UpdatedAt string        `json:"updatedAt"`
	Messages  []ChatMessage `json:"messages"`
}

type ChatResponse struct {
	ID           string             `json:"id"`
	Type         string             `json:"type"`
	Role         string             `json:"role"`
	Model        string             `json:"model"`
	Content      []ChatContentBlock `json:"content"`
	StopReason   string             `json:"stop_reason"`
	StopSequence string             `json:"stop_sequence"`
}

type chatStreamEvent struct {
	Type         string            `json:"type"`
	Message      *ChatResponse     `json:"message,omitempty"`
	Index        int               `json:"index,omitempty"`
	ContentBlock *ChatContentBlock `json:"content_block,omitempty"`
	Delta        *chatStreamDelta  `json:"delta,omitempty"`
	Error        *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type chatStreamDelta struct {
	Type         string `json:"type"`
	Text         string `json:"text,omitempty"`
	Thinking     string `json:"thinking,omitempty"`
	Signature    string `json:"signature,omitempty"`
	PartialJSON  string `json:"partial_json,omitempty"`
	StopReason   string `json:"stop_reason,omitempty"`
	StopSequence string `json:"stop_sequence,omitempty"`
}

type chatStreamChunk struct {
	RequestID string           `json:"requestId"`
	Index     int              `json:"index"`
	Block     ChatContentBlock `json:"block"`
}

type chatStreamComplete struct {
	RequestID string        `json:"requestId"`
	Response  *ChatResponse `json:"response"`
}

func NewApp() *App {
	return &App{
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
		apiBaseURL: strings.TrimRight(defaultAPIBaseURL, "/"),
		llmBaseURL: strings.TrimRight(defaultLLMBaseURL, "/"),
		llmAPIKey:  defaultLLMAPIKey,
		llmModel:   defaultLLMModel,
		streams:    map[string]context.CancelFunc{},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Login(account string, password string, remember bool) (*OpenTokenResponse, error) {
	account = strings.TrimSpace(account)
	password = strings.TrimSpace(password)
	if account == "" || password == "" {
		return nil, fmt.Errorf("账号和密码不能为空")
	}

	result := &OpenTokenResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/token", &OpenTokenRequest{
		Account:  account,
		Password: password,
	}, nil, result); err != nil {
		return nil, err
	}

	if err := a.persistSession(result, remember); err != nil {
		return result, err
	}
	return result, nil
}

func (a *App) SendEmailCode(email string, scene string) (*BaseResponse, error) {
	email = strings.TrimSpace(email)
	scene = strings.TrimSpace(scene)
	if email == "" {
		return nil, fmt.Errorf("邮箱不能为空")
	}
	if scene == "" {
		scene = "login"
	}

	result := &BaseResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/email-code/send", &EmailCodeRequest{
		Email: email,
		Scene: scene,
	}, nil, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (a *App) Register(account string, password string, displayName string, email string, mobile string) (*OpenRegisterResponse, error) {
	account = strings.TrimSpace(account)
	password = strings.TrimSpace(password)
	displayName = strings.TrimSpace(displayName)
	email = strings.TrimSpace(email)
	mobile = strings.TrimSpace(mobile)
	if account == "" || password == "" || displayName == "" {
		return nil, fmt.Errorf("账号、密码、显示名不能为空")
	}

	result := &OpenRegisterResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/register", &OpenRegisterRequest{
		Account:     account,
		Password:    password,
		DisplayName: displayName,
		Email:       email,
		Mobile:      mobile,
	}, nil, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (a *App) RegisterByEmail(email string, code string, displayName string, password string) (*BaseResponse, error) {
	email = strings.TrimSpace(email)
	code = strings.TrimSpace(code)
	displayName = strings.TrimSpace(displayName)
	password = strings.TrimSpace(password)
	if email == "" || code == "" || displayName == "" || password == "" {
		return nil, fmt.Errorf("邮箱、验证码、显示名、密码不能为空")
	}

	result := &BaseResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/email/register", &OpenEmailRegisterRequest{
		Email:       email,
		Code:        code,
		DisplayName: displayName,
		Password:    password,
	}, nil, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (a *App) LoginByEmailCode(email string, code string, clientID string, remember bool) (*OpenTokenResponse, error) {
	email = strings.TrimSpace(email)
	code = strings.TrimSpace(code)
	clientID = fallbackClientID(clientID)
	if email == "" || code == "" {
		return nil, fmt.Errorf("邮箱和验证码不能为空")
	}

	result := &OpenTokenResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/email/token", &OpenEmailTokenRequest{
		Email:    email,
		Code:     code,
		ClientID: clientID,
	}, nil, result); err != nil {
		return nil, err
	}

	if err := a.persistSession(result, remember); err != nil {
		return result, err
	}
	return result, nil
}

func (a *App) RestoreSession() (*OpenTokenResponse, error) {
	session, err := a.GetSession()
	if err != nil {
		return nil, err
	}
	if session == nil || session.Response == nil || session.Response.Data == nil {
		return nil, nil
	}
	if strings.TrimSpace(session.Response.Data.AccessToken) == "" {
		return nil, nil
	}

	meResponse, err := a.fetchCurrentUser(session.Response.Data.AccessToken)
	if err != nil {
		if refreshErr := a.tryRefreshSession(session); refreshErr != nil {
			_ = a.ClearSession()
			return nil, refreshErr
		}
		return session.Response, nil
	}

	applyProfile(session.Response, meResponse.Data)
	if err := a.saveSession(session); err != nil {
		return nil, err
	}
	return session.Response, nil
}

func (a *App) RefreshSession(clientID string) (*OpenTokenResponse, error) {
	session, err := a.GetSession()
	if err != nil {
		return nil, err
	}
	if session == nil || session.Response == nil || session.Response.Data == nil {
		return nil, fmt.Errorf("当前没有可刷新的本地会话")
	}

	if err := a.refreshTokenForSession(session, fallbackClientID(clientID)); err != nil {
		return nil, err
	}
	return session.Response, nil
}

func (a *App) Logout() (*MessageResponse, error) {
	session, err := a.GetSession()
	if err != nil {
		return nil, err
	}

	refreshToken := ""
	accessToken := ""
	if session != nil && session.Response != nil && session.Response.Data != nil {
		refreshToken = strings.TrimSpace(session.Response.Data.RefreshToken)
		accessToken = strings.TrimSpace(session.Response.Data.AccessToken)
	}

	result := &MessageResponse{}
	headers := map[string]string{}
	if accessToken != "" {
		headers["Authorization"] = "Bearer " + accessToken
	}
	if err := a.doJSON(http.MethodPost, "/api/open/logout", &OpenLogoutRequest{
		RefreshToken: refreshToken,
	}, headers, result); err != nil {
		return nil, err
	}

	if err := a.ClearSession(); err != nil {
		return result, err
	}
	return result, nil
}

func (a *App) GetSession() (*SessionState, error) {
	sessionPath, err := a.sessionFilePath()
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(sessionPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取本地会话失败: %w", err)
	}

	var session SessionState
	if err := json.Unmarshal(content, &session); err != nil {
		return nil, fmt.Errorf("解析本地会话失败: %w", err)
	}
	if !session.Remembered || session.Response == nil {
		return nil, nil
	}
	now := time.Now()
	if strings.TrimSpace(session.ExpiresAt) == "" {
		session.CreatedAt = now.Format(time.RFC3339)
		session.ExpiresAt = now.Add(rememberedSessionDuration).Format(time.RFC3339)
		if err := a.saveSession(&session); err != nil {
			return nil, err
		}
	}
	if session.isExpired(now) {
		_ = a.ClearSession()
		return nil, nil
	}
	return &session, nil
}

func (a *App) ClearSession() error {
	sessionPath, err := a.sessionFilePath()
	if err != nil {
		return err
	}

	err = os.Remove(sessionPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("删除本地会话失败: %w", err)
	}
	return nil
}

func (a *App) GetAPIBaseURL() string {
	return a.apiBaseURL
}

func (a *App) GetDefaultClientID() string {
	return defaultClientID
}

func (a *App) GetDefaultLLMModel() string {
	return a.llmModel
}

func (a *App) LoadChatConversations() ([]ChatConversation, error) {
	conversationPath, err := a.chatConversationsFilePath()
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(conversationPath)
	if errors.Is(err, os.ErrNotExist) {
		return []ChatConversation{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("读取本地对话失败: %w", err)
	}

	var conversations []ChatConversation
	if err := json.Unmarshal(content, &conversations); err != nil {
		return nil, fmt.Errorf("解析本地对话失败: %w", err)
	}
	return conversations, nil
}

func (a *App) SaveChatConversations(conversations []ChatConversation) error {
	for index, conversation := range conversations {
		if strings.TrimSpace(conversation.ID) == "" {
			return fmt.Errorf("第 %d 个对话缺少 ID", index+1)
		}
	}

	conversationPath, err := a.chatConversationsFilePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(conversationPath), 0o755); err != nil {
		return fmt.Errorf("创建对话目录失败: %w", err)
	}

	content, err := json.Marshal(conversations)
	if err != nil {
		return fmt.Errorf("序列化对话失败: %w", err)
	}
	if err := os.WriteFile(conversationPath, content, 0o600); err != nil {
		return fmt.Errorf("写入对话失败: %w", err)
	}
	return nil
}

func (a *App) IsWailsRuntime() bool {
	return a.ctx != nil
}

func (a *App) Chat(messages []ChatMessage, systemPrompt string) (*ChatResponse, error) {
	if strings.TrimSpace(a.llmAPIKey) == "" {
		return nil, fmt.Errorf("未配置模型 API Key")
	}
	if len(messages) == 0 {
		return nil, fmt.Errorf("消息历史不能为空")
	}

	normalizedMessages, err := buildLLMRequestMessages(messages)
	if err != nil {
		return nil, err
	}

	systemPrompt = strings.TrimSpace(systemPrompt)

	requestBody := map[string]any{
		"model":    a.llmModel,
		"messages": normalizedMessages,
	}
	if systemPrompt != "" {
		requestBody["system"] = systemPrompt
	}

	response := &ChatResponse{}
	if err := a.doLLMJSON(http.MethodPost, "/v1/messages", requestBody, response); err != nil {
		return nil, err
	}
	if len(response.Content) == 0 {
		return nil, fmt.Errorf("模型未返回内容")
	}
	return response, nil
}

func (a *App) StartChatStream(requestID string, messages []ChatMessage, systemPrompt string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return fmt.Errorf("请求 ID 不能为空")
	}
	if strings.TrimSpace(a.llmAPIKey) == "" {
		return fmt.Errorf("未配置模型 API Key")
	}
	if len(messages) == 0 {
		return fmt.Errorf("消息历史不能为空")
	}
	if a.ctx == nil {
		return fmt.Errorf("当前运行环境不支持事件推送")
	}

	normalizedMessages, err := buildLLMRequestMessages(messages)
	if err != nil {
		return err
	}

	systemPrompt = strings.TrimSpace(systemPrompt)

	requestBody := map[string]any{
		"model":    a.llmModel,
		"messages": normalizedMessages,
		"stream":   true,
	}
	if systemPrompt != "" {
		requestBody["system"] = systemPrompt
	}

	a.unregisterStream(requestID)
	return a.doLLMStream("/v1/messages", requestID, requestBody)
}

func (a *App) StopChatStream(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return fmt.Errorf("请求 ID 不能为空")
	}

	a.streamMu.Lock()
	cancel, ok := a.streams[requestID]
	a.streamMu.Unlock()
	if !ok {
		return nil
	}
	cancel()
	return nil
}

func buildLLMRequestMessages(messages []ChatMessage) ([]llmRequestMessage, error) {
	normalizedMessages := make([]llmRequestMessage, 0, len(messages))
	for _, message := range messages {
		role := strings.TrimSpace(message.Role)
		if role == "" {
			return nil, fmt.Errorf("消息角色不能为空")
		}
		if len(message.Content) == 0 {
			return nil, fmt.Errorf("消息内容不能为空")
		}

		contentValue, err := buildLLMMessageContent(message.Content)
		if err != nil {
			return nil, err
		}

		normalizedMessages = append(normalizedMessages, llmRequestMessage{
			Role:    role,
			Content: contentValue,
		})
	}
	return normalizedMessages, nil
}

func buildLLMMessageContent(content []ChatContentBlock) (any, error) {
	if len(content) == 1 && strings.TrimSpace(content[0].Type) == "text" {
		text := strings.TrimSpace(content[0].Text)
		if text == "" {
			return nil, fmt.Errorf("文本消息不能为空")
		}
		return text, nil
	}

	normalized := make([]map[string]any, 0, len(content))
	for _, block := range content {
		blockType := strings.TrimSpace(block.Type)
		if blockType == "" {
			return nil, fmt.Errorf("消息内容块类型不能为空")
		}

		item := map[string]any{
			"type": blockType,
		}
		if text := strings.TrimSpace(block.Text); text != "" {
			item["text"] = text
		}
		if thinking := strings.TrimSpace(block.Thinking); thinking != "" {
			item["thinking"] = thinking
		}
		if signature := strings.TrimSpace(block.Signature); signature != "" {
			item["signature"] = signature
		}
		if id := strings.TrimSpace(block.ID); id != "" {
			item["id"] = id
		}
		if name := strings.TrimSpace(block.Name); name != "" {
			item["name"] = name
		}
		if len(block.Input) > 0 {
			item["input"] = block.Input
		}
		normalized = append(normalized, item)
	}
	return normalized, nil
}

func (a *App) persistSession(result *OpenTokenResponse, remember bool) error {
	if !remember {
		if err := a.ClearSession(); err != nil {
			return fmt.Errorf("登录成功，但清理本地会话失败: %w", err)
		}
		return nil
	}
	now := time.Now()
	if err := a.saveSession(&SessionState{
		Remembered: true,
		CreatedAt:  now.Format(time.RFC3339),
		ExpiresAt:  now.Add(rememberedSessionDuration).Format(time.RFC3339),
		Response:   result,
	}); err != nil {
		return fmt.Errorf("登录成功，但保存本地会话失败: %w", err)
	}
	return nil
}

func (s *SessionState) isExpired(now time.Time) bool {
	if s == nil || strings.TrimSpace(s.ExpiresAt) == "" {
		return true
	}
	expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(s.ExpiresAt))
	if err != nil {
		return true
	}
	return !now.Before(expiresAt)
}

func (a *App) tryRefreshSession(session *SessionState) error {
	if session == nil || session.Response == nil || session.Response.Data == nil {
		return fmt.Errorf("当前没有可恢复的本地会话")
	}
	return a.refreshTokenForSession(session, defaultClientID)
}

func (a *App) refreshTokenForSession(session *SessionState, clientID string) error {
	if session == nil || session.Response == nil || session.Response.Data == nil {
		return fmt.Errorf("当前没有可刷新的本地会话")
	}
	refreshToken := strings.TrimSpace(session.Response.Data.RefreshToken)
	if refreshToken == "" {
		return fmt.Errorf("当前会话缺少 refresh token")
	}

	result := &OpenRefreshResponse{}
	if err := a.doJSON(http.MethodPost, "/api/open/refresh", &OpenRefreshRequest{
		RefreshToken: refreshToken,
		ClientID:     fallbackClientID(clientID),
	}, nil, result); err != nil {
		return err
	}
	if result.Data == nil {
		return fmt.Errorf("刷新 token 响应为空")
	}

	session.Response.Code = result.Code
	session.Response.Msg = result.Msg
	session.Response.UUID = result.UUID
	session.Response.Data.AccessToken = result.Data.AccessToken
	session.Response.Data.TokenType = result.Data.TokenType
	session.Response.Data.ExpiresIn = result.Data.ExpiresIn
	session.Response.Data.RefreshToken = result.Data.RefreshToken
	session.Response.Data.RefreshExpiresIn = result.Data.RefreshExpiresIn
	session.Response.Data.Scope = result.Data.Scope

	meResponse, err := a.fetchCurrentUser(session.Response.Data.AccessToken)
	if err != nil {
		return err
	}
	applyProfile(session.Response, meResponse.Data)

	if err := a.saveSession(session); err != nil {
		return err
	}
	return nil
}

func (a *App) saveSession(session *SessionState) error {
	sessionPath, err := a.sessionFilePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(sessionPath), 0o755); err != nil {
		return fmt.Errorf("创建会话目录失败: %w", err)
	}

	content, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("序列化本地会话失败: %w", err)
	}
	if err := os.WriteFile(sessionPath, content, 0o600); err != nil {
		return fmt.Errorf("写入本地会话失败: %w", err)
	}
	return nil
}

func (a *App) sessionFilePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("获取本地配置目录失败: %w", err)
	}
	return filepath.Join(configDir, "mugua-ai", "session.json"), nil
}

func (a *App) chatConversationsFilePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("获取本地配置目录失败: %w", err)
	}
	return filepath.Join(configDir, "mugua-ai", "chat_conversations.json"), nil
}

func (a *App) doJSON(method string, path string, payload any, headers map[string]string, target any) error {
	requestContext := context.Background()
	if a.ctx != nil {
		requestContext = a.ctx
	}

	var bodyReader io.Reader
	if payload != nil {
		content, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("构造请求失败: %w", err)
		}
		bodyReader = bytes.NewReader(content)
	}

	request, err := http.NewRequestWithContext(requestContext, method, a.apiBaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		if strings.TrimSpace(value) != "" {
			request.Header.Set(key, value)
		}
	}

	response, err := a.client.Do(request)
	if err != nil {
		return fmt.Errorf("请求失败: %w", err)
	}
	defer response.Body.Close()

	content, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	if target != nil && len(content) > 0 {
		if err := json.Unmarshal(content, target); err != nil {
			return fmt.Errorf("解析响应失败: %w", err)
		}
	}

	if response.StatusCode != http.StatusOK {
		if msg := extractMessage(target); msg != "" {
			return errors.New(msg)
		}
		return fmt.Errorf("请求失败，HTTP 状态码: %d", response.StatusCode)
	}
	if code, msg := extractCodeAndMessage(target); code != 0 && code != http.StatusOK {
		if msg == "" {
			msg = "请求失败"
		}
		return errors.New(msg)
	}
	return nil
}

func (a *App) doLLMJSON(method string, path string, payload any, target any) error {
	requestContext := context.Background()
	if a.ctx != nil {
		requestContext = a.ctx
	}

	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("构造模型请求失败: %w", err)
	}

	request, err := http.NewRequestWithContext(
		requestContext,
		method,
		a.llmBaseURL+path,
		bytes.NewReader(content),
	)
	if err != nil {
		return fmt.Errorf("创建模型请求失败: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(a.llmAPIKey))

	response, err := a.client.Do(request)
	if err != nil {
		return fmt.Errorf("模型请求失败: %w", err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("读取模型响应失败: %w", err)
	}

	log.Printf("[llm][json] auth=%s status=%d body=%s", maskAPIKey(a.llmAPIKey), response.StatusCode, shortenLogBody(body))

	if target != nil && len(body) > 0 {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("解析模型响应失败: %w", err)
		}
	}

	if response.StatusCode != http.StatusOK {
		type llmErrorResponse struct {
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		var llmErr llmErrorResponse
		if len(body) > 0 && json.Unmarshal(body, &llmErr) == nil && llmErr.Error != nil && llmErr.Error.Message != "" {
			return fmt.Errorf("模型请求失败: %s", llmErr.Error.Message)
		}
		return fmt.Errorf("模型请求失败，HTTP 状态码: %d", response.StatusCode)
	}
	if targetResponse, ok := target.(*ChatResponse); ok {
		log.Printf("[llm][json] stop_reason=%s", strings.TrimSpace(targetResponse.StopReason))
	}
	return nil
}

func (a *App) doLLMStream(path string, requestID string, payload any) error {
	requestContext := context.Background()
	if a.ctx != nil {
		requestContext = a.ctx
	}
	requestContext, cancel := context.WithCancel(requestContext)
	a.registerStream(requestID, cancel)
	defer a.unregisterStream(requestID)

	content, err := json.Marshal(payload)
	if err != nil {
		cancel()
		return fmt.Errorf("构造模型流式请求失败: %w", err)
	}

	request, err := http.NewRequestWithContext(
		requestContext,
		http.MethodPost,
		a.llmBaseURL+path,
		bytes.NewReader(content),
	)
	if err != nil {
		cancel()
		return fmt.Errorf("创建模型流式请求失败: %w", err)
	}

	token := strings.TrimSpace(a.llmAPIKey)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	request.Header.Set("Content-Type", "application/json")

	log.Printf("[llm][stream] req %s %s headers=[%s] body=%s",
		request.Method, request.URL.String(), formatHTTPHeadersForLog(request.Header), shortenLogBody(content))

	response, err := a.client.Do(request)
	if err != nil {
		if errors.Is(requestContext.Err(), context.Canceled) {
			return fmt.Errorf("已停止生成")
		}
		return fmt.Errorf("模型流式请求失败: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		log.Printf("[llm][stream] auth=%s status=%d body=%s", maskAPIKey(a.llmAPIKey), response.StatusCode, shortenLogBody(body))
		type llmErrorResponse struct {
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		var llmErr llmErrorResponse
		if len(body) > 0 && json.Unmarshal(body, &llmErr) == nil && llmErr.Error != nil && llmErr.Error.Message != "" {
			return fmt.Errorf("模型流式请求失败: %s", llmErr.Error.Message)
		}
		return fmt.Errorf("模型流式请求失败，HTTP 状态码: %d", response.StatusCode)
	}

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var eventName string
	var dataBuilder strings.Builder
	finalResponse := &ChatResponse{}
	inputBuffers := map[int]string{}

	flushEvent := func() error {
		if eventName == "" {
			dataBuilder.Reset()
			return nil
		}

		rawEventName := eventName
		eventName = ""
		data := strings.TrimSpace(dataBuilder.String())
		dataBuilder.Reset()
		if data == "" || data == "[DONE]" {
			return nil
		}

		var event chatStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			return fmt.Errorf("解析流式事件失败: %w", err)
		}
		if event.Type == "" {
			event.Type = rawEventName
		}

		switch event.Type {
		case "message_start":
			if event.Message != nil {
				finalResponse.ID = event.Message.ID
				finalResponse.Type = event.Message.Type
				finalResponse.Role = event.Message.Role
				finalResponse.Model = event.Message.Model
				finalResponse.Content = make([]ChatContentBlock, 0, 8)
			}
		case "content_block_start":
			if event.Index < 0 || event.ContentBlock == nil {
				return nil
			}
			for len(finalResponse.Content) <= event.Index {
				finalResponse.Content = append(finalResponse.Content, ChatContentBlock{})
			}
			finalResponse.Content[event.Index] = *event.ContentBlock
			wailsruntime.EventsEmit(a.ctx, "chat_stream_chunk", chatStreamChunk{
				RequestID: requestID,
				Index:     event.Index,
				Block:     finalResponse.Content[event.Index],
			})
		case "content_block_delta":
			if event.Index < 0 || event.Delta == nil {
				return nil
			}
			for len(finalResponse.Content) <= event.Index {
				finalResponse.Content = append(finalResponse.Content, ChatContentBlock{})
			}
			block := finalResponse.Content[event.Index]
			if block.Type == "" {
				block.Type = inferBlockType(event.Delta.Type)
			}

			switch event.Delta.Type {
			case "text_delta":
				block.Type = "text"
				block.Text += event.Delta.Text
			case "thinking_delta":
				block.Type = "thinking"
				block.Thinking += event.Delta.Thinking
			case "signature_delta":
				block.Type = "thinking"
				block.Signature += event.Delta.Signature
			case "input_json_delta":
				block.Type = "tool_use"
				inputBuffers[event.Index] += event.Delta.PartialJSON
				if strings.TrimSpace(inputBuffers[event.Index]) != "" {
					block.Input = json.RawMessage([]byte(inputBuffers[event.Index]))
				}
			}

			finalResponse.Content[event.Index] = block
			wailsruntime.EventsEmit(a.ctx, "chat_stream_chunk", chatStreamChunk{
				RequestID: requestID,
				Index:     event.Index,
				Block:     block,
			})
		case "content_block_stop":
			if event.Index >= 0 && event.Index < len(finalResponse.Content) {
				block := finalResponse.Content[event.Index]
				if raw, ok := inputBuffers[event.Index]; ok && strings.TrimSpace(raw) != "" {
					block.Input = json.RawMessage([]byte(raw))
					finalResponse.Content[event.Index] = block
				}
			}
		case "message_delta":
			if event.Delta != nil {
				if event.Delta.StopReason != "" {
					finalResponse.StopReason = event.Delta.StopReason
				}
				if event.Delta.StopSequence != "" {
					finalResponse.StopSequence = event.Delta.StopSequence
				}
			}
		case "message_stop":
			log.Printf("[llm][stream] stop_reason=%s", strings.TrimSpace(finalResponse.StopReason))
			wailsruntime.EventsEmit(a.ctx, "chat_stream_complete", chatStreamComplete{
				RequestID: requestID,
				Response:  finalResponse,
			})
		case "error":
			if event.Error != nil && event.Error.Message != "" {
				return fmt.Errorf("模型流式请求失败: %s", event.Error.Message)
			}
			return fmt.Errorf("模型流式请求失败")
		}

		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			dataBuilder.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		case strings.TrimSpace(line) == "":
			if err := flushEvent(); err != nil {
				return err
			}
		}
	}

	if err := scanner.Err(); err != nil {
		if errors.Is(requestContext.Err(), context.Canceled) {
			return fmt.Errorf("已停止生成")
		}
		return fmt.Errorf("读取模型流式响应失败: %w", err)
	}

	if err := flushEvent(); err != nil {
		return err
	}
	return nil
}

func (a *App) registerStream(requestID string, cancel context.CancelFunc) {
	a.streamMu.Lock()
	defer a.streamMu.Unlock()
	a.streams[requestID] = cancel
}

func (a *App) unregisterStream(requestID string) {
	a.streamMu.Lock()
	defer a.streamMu.Unlock()
	delete(a.streams, requestID)
}

func inferBlockType(deltaType string) string {
	switch deltaType {
	case "text_delta":
		return "text"
	case "thinking_delta", "signature_delta":
		return "thinking"
	case "input_json_delta":
		return "tool_use"
	default:
		return ""
	}
}

func shortenLogBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	const maxLength = 1200
	if len(text) <= maxLength {
		return text
	}
	return text[:maxLength] + "...(truncated)"
}

func formatHTTPHeadersForLog(h http.Header) string {
	if len(h) == 0 {
		return ""
	}
	keys := make([]string, 0, len(h))
	for k := range h {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		for _, v := range h.Values(k) {
			if strings.EqualFold(k, "Authorization") {
				tok := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(v, "Bearer "), "bearer "))
				v = "Bearer " + maskAPIKey(tok)
			}
			parts = append(parts, k+": "+v)
		}
	}
	return strings.Join(parts, "; ")
}

func maskAPIKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return "empty"
	}
	if len(key) <= 16 {
		return fmt.Sprintf("len=%d %s", len(key), key)
	}
	return fmt.Sprintf("len=%d %s...%s", len(key), key[:10], key[len(key)-6:])
}

func (a *App) fetchCurrentUser(accessToken string) (*OpenMeResponse, error) {
	result := &OpenMeResponse{}
	if err := a.doJSON(http.MethodGet, "/api/open/me", nil, map[string]string{
		"Authorization": "Bearer " + accessToken,
	}, result); err != nil {
		return nil, fmt.Errorf("查询当前用户失败: %w", err)
	}
	if result.Data == nil {
		return nil, fmt.Errorf("用户信息响应为空")
	}
	return result, nil
}

func applyProfile(response *OpenTokenResponse, profile *OpenUserProfile) {
	if response == nil || response.Data == nil || profile == nil {
		return
	}
	response.Data.User = &OpenTokenUser{
		UserID:      profile.UserID,
		Account:     profile.Account,
		DisplayName: profile.DisplayName,
		Email:       profile.Email,
		Mobile:      profile.Mobile,
	}
	if profile.SessionID != "" {
		response.Data.SessionID = profile.SessionID
	}
	if len(profile.Scope) > 0 {
		response.Data.Scope = strings.Join(profile.Scope, ",")
	}
}

func fallbackClientID(clientID string) string {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return defaultClientID
	}
	return clientID
}

func extractMessage(target any) string {
	switch value := target.(type) {
	case *BaseResponse:
		return value.Msg
	case *MessageResponse:
		return value.Msg
	case *OpenRegisterResponse:
		return value.Msg
	case *OpenTokenResponse:
		return value.Msg
	case *OpenRefreshResponse:
		return value.Msg
	case *OpenMeResponse:
		return value.Msg
	default:
		return ""
	}
}

func extractCodeAndMessage(target any) (int, string) {
	switch value := target.(type) {
	case *BaseResponse:
		return value.Code, value.Msg
	case *MessageResponse:
		return value.Code, value.Msg
	case *OpenRegisterResponse:
		return value.Code, value.Msg
	case *OpenTokenResponse:
		return value.Code, value.Msg
	case *OpenRefreshResponse:
		return value.Code, value.Msg
	case *OpenMeResponse:
		return value.Code, value.Msg
	default:
		return 0, ""
	}
}
