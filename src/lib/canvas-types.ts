export type SharedCanvasInfo={id:string;title:string;classId:string;status:'open'|'frozen'|'archived';epoch:string;generation:number;assetCount:number;createdAt:string;updatedAt:string;canManage:boolean;canEdit:boolean;studentIds?:string[];mission?:string;activityId?:string;groupName?:string;shareResults?:boolean;viewOnly?:boolean};
export type CanvasViewer={uid:string;key:string;name:string;role:string};
export type CanvasVersion={id:string;label:string;actorName:string;generation:number;createdAt:string};
export type CanvasChange={id:string;type:string;actorKey:string;actorName:string;summary:string;generation:number;epoch:string;createdAt:string};
