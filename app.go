package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultClientID = "ops_console_web"

type App struct {
	ctx        context.Context
	client     *http.Client
	apiBaseURL string
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
	Response   *OpenTokenResponse `json:"response"`
}

func NewApp() *App {
	baseURL := strings.TrimSpace(os.Getenv("MUGUA_API_BASE_URL"))
	if baseURL == "" {
		baseURL = "http://touwomugua.cn"
	}

	return &App{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		apiBaseURL: strings.TrimRight(baseURL, "/"),
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

func (a *App) IsWailsRuntime() bool {
	return a.ctx != nil
}

func (a *App) persistSession(result *OpenTokenResponse, remember bool) error {
	if !remember {
		if err := a.ClearSession(); err != nil {
			return fmt.Errorf("登录成功，但清理本地会话失败: %w", err)
		}
		return nil
	}
	if err := a.saveSession(&SessionState{
		Remembered: true,
		Response:   result,
	}); err != nil {
		return fmt.Errorf("登录成功，但保存本地会话失败: %w", err)
	}
	return nil
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
