import {BOARD_TEXT_LIMIT} from './chalkboard';

/** Rebuild a small text-only HTML vocabulary. Stored/imported HTML is never trusted. */
export function cleanBoardHtml(html:string):string {
  const parsed=new DOMParser().parseFromString(html.slice(0,400000),'text/html');
  const output=document.createElement('div');let remaining=BOARD_TEXT_LIMIT;
  function copy(source:Node,target:Node,depth=0) {
    if(remaining<=0)return;
    if(source.nodeType===Node.TEXT_NODE){const text=(source.textContent||'').slice(0,remaining);remaining-=text.length;target.appendChild(document.createTextNode(text));return;}
    if(!(source instanceof Element))return;
    const tag=source.tagName.toUpperCase();
    if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE','IMG','VIDEO','AUDIO'].includes(tag))return;
    if(depth>=32){const text=(source.textContent||'').slice(0,remaining);remaining-=text.length;target.appendChild(document.createTextNode(text));return;}
    if(tag==='BR'){target.appendChild(document.createElement('br'));remaining--;return;}
    const tags:Record<string,string>={P:'div',DIV:'div',LI:'div',SPAN:'span',FONT:'span',B:'strong',STRONG:'strong',I:'em',EM:'em',U:'u',S:'s',STRIKE:'s'};
    const element=document.createElement(tags[tag]||'span');
    if(source instanceof HTMLElement) {
      const style=source.style;
      for(const key of ['color','backgroundColor'] as const) {
        const value=style[key]||(key==='color'?source.getAttribute('color'):'');
        if(value && /^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{1,20})$/i.test(value))element.style[key]=value;
      }
      const size=parseFloat(style.fontSize);
      if(Number.isFinite(size))element.style.fontSize=Math.max(16,Math.min(120,size))+'px';
      if(['bold','700'].includes(style.fontWeight))element.style.fontWeight='bold';
      if(style.fontStyle==='italic')element.style.fontStyle='italic';
      if(/^(underline|line-through)( (underline|line-through))?$/.test(style.textDecorationLine||style.textDecoration))element.style.textDecorationLine=style.textDecorationLine||style.textDecoration;
    }
    for(const child of source.childNodes)copy(child,element,depth+1);
    if(element.tagName==='DIV')remaining--;
    target.appendChild(element);
  }
  for(const child of parsed.body.childNodes)copy(child,output);
  const text=boardPlainText(output);
  if(text.length>BOARD_TEXT_LIMIT)output.textContent=text.slice(0,BOARD_TEXT_LIMIT);
  return output.innerHTML;
}

export function boardPlainText(root:Node):string {
  let text='';
  function read(node:Node){if(node.nodeType===Node.TEXT_NODE){text+=node.textContent||'';return;}if(node instanceof HTMLBRElement){text+='\n';return;}const block=node instanceof Element&&['DIV','P','LI'].includes(node.tagName)&&node!==root;if(block&&text&&!text.endsWith('\n'))text+='\n';for(const child of node.childNodes)read(child);if(block&&node.nextSibling&&!text.endsWith('\n'))text+='\n';}
  read(root);return text.replace(/\r\n?/g,'\n');
}
