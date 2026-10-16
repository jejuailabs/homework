export type LessonRecord={id:string;classId:string;title:string;date:string;subject:string;unit:string;objective:string;notes:string;toolIds:string[];links:{kind:'assignment'|'cards'|'board'|'exhibition';id:string;title:string}[];createdAt:string};
export type ReportTask={id:string;title:string;targetCount:number;pending:number;submitted:number;done:number;revision:number};
export type ReportStudent={id:string;name:string;number:number;active:boolean;assignments:number;submitted:number;done:number;revision:number;cardSessions:number;cardAttempts:number;latestScores:number[];points:number};
export type ClassReportSnapshot={
 id:string;version:number;previousId:string|null;classId:string;className:string;title:string;from:string;to:string;capturedAt:string;createdAt:string;
 teacherNotes:string;narrative:string;metrics:{students:number;assignments:number;targets:number;submitted:number;done:number;revision:number;pending:number;cardSets:number;cardAttempts:number;boards:number;boardPosts:number;exhibitions:number;artworks:number;lessons:number};
 assignments:ReportTask[];students:ReportStudent[];cards:{id:string;title:string;targetCount:number;attempts:number}[];
 boards:{id:string;title:string;postCount:number}[];exhibitions:{id:string;title:string;artworkCount:number}[];lessons:LessonRecord[];
 scope:'created-in-period-current-status';
};
export type ReportSummary=Pick<ClassReportSnapshot,'id'|'title'|'from'|'to'|'capturedAt'|'createdAt'|'version'>;
