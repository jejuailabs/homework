import ToolWindowsProvider from '@/components/tool-windows';
import BerryPanel from '@/modules/berry-panel/panel';
export default function TeacherLayout({children}: {children: React.ReactNode}) {return <ToolWindowsProvider>{children}<BerryPanel/></ToolWindowsProvider>;}
