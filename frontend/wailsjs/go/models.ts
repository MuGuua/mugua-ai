export namespace main {
	
	export class BaseResponse {
	    code: number;
	    msg: string;
	    uuid: string;
	
	    static createFrom(source: any = {}) {
	        return new BaseResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.msg = source["msg"];
	        this.uuid = source["uuid"];
	    }
	}
	export class ChatContentBlock {
	    type: string;
	    text?: string;
	    thinking?: string;
	    signature?: string;
	    id?: string;
	    name?: string;
	    input?: number[];
	
	    static createFrom(source: any = {}) {
	        return new ChatContentBlock(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.text = source["text"];
	        this.thinking = source["thinking"];
	        this.signature = source["signature"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.input = source["input"];
	    }
	}
	export class ChatMessage {
	    role: string;
	    content: ChatContentBlock[];
	
	    static createFrom(source: any = {}) {
	        return new ChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = this.convertValues(source["content"], ChatContentBlock);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ChatConversation {
	    id: string;
	    title: string;
	    createdAt: string;
	    updatedAt: string;
	    messages: ChatMessage[];
	
	    static createFrom(source: any = {}) {
	        return new ChatConversation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.messages = this.convertValues(source["messages"], ChatMessage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ChatResponse {
	    id: string;
	    type: string;
	    role: string;
	    model: string;
	    content: ChatContentBlock[];
	    stop_reason: string;
	    stop_sequence: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.role = source["role"];
	        this.model = source["model"];
	        this.content = this.convertValues(source["content"], ChatContentBlock);
	        this.stop_reason = source["stop_reason"];
	        this.stop_sequence = source["stop_sequence"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MessageData {
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new MessageData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	    }
	}
	export class MessageResponse {
	    code: number;
	    msg: string;
	    uuid: string;
	    data?: MessageData;
	
	    static createFrom(source: any = {}) {
	        return new MessageResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.msg = source["msg"];
	        this.uuid = source["uuid"];
	        this.data = this.convertValues(source["data"], MessageData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OpenRegisterData {
	    userId: string;
	    account: string;
	    displayName: string;
	    status: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenRegisterData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userId = source["userId"];
	        this.account = source["account"];
	        this.displayName = source["displayName"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class OpenRegisterResponse {
	    code: number;
	    msg: string;
	    uuid: string;
	    data?: OpenRegisterData;
	
	    static createFrom(source: any = {}) {
	        return new OpenRegisterResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.msg = source["msg"];
	        this.uuid = source["uuid"];
	        this.data = this.convertValues(source["data"], OpenRegisterData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OpenTokenUser {
	    userId: string;
	    account: string;
	    displayName: string;
	    email: string;
	    mobile: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenTokenUser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userId = source["userId"];
	        this.account = source["account"];
	        this.displayName = source["displayName"];
	        this.email = source["email"];
	        this.mobile = source["mobile"];
	    }
	}
	export class OpenTokenData {
	    accessToken: string;
	    tokenType: string;
	    expiresIn: number;
	    refreshToken: string;
	    refreshExpiresIn: number;
	    scope: string;
	    sessionId: string;
	    user?: OpenTokenUser;
	
	    static createFrom(source: any = {}) {
	        return new OpenTokenData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accessToken = source["accessToken"];
	        this.tokenType = source["tokenType"];
	        this.expiresIn = source["expiresIn"];
	        this.refreshToken = source["refreshToken"];
	        this.refreshExpiresIn = source["refreshExpiresIn"];
	        this.scope = source["scope"];
	        this.sessionId = source["sessionId"];
	        this.user = this.convertValues(source["user"], OpenTokenUser);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OpenTokenResponse {
	    code: number;
	    msg: string;
	    uuid: string;
	    data?: OpenTokenData;
	
	    static createFrom(source: any = {}) {
	        return new OpenTokenResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.msg = source["msg"];
	        this.uuid = source["uuid"];
	        this.data = this.convertValues(source["data"], OpenTokenData);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SessionState {
	    remembered: boolean;
	    createdAt?: string;
	    expiresAt?: string;
	    response?: OpenTokenResponse;
	
	    static createFrom(source: any = {}) {
	        return new SessionState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.remembered = source["remembered"];
	        this.createdAt = source["createdAt"];
	        this.expiresAt = source["expiresAt"];
	        this.response = this.convertValues(source["response"], OpenTokenResponse);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

