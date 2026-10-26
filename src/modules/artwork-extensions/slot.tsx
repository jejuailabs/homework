'use client';
import dynamic from 'next/dynamic';
import { moduleOptions } from './types';
import './styles.css';
const Voice = dynamic(() => import('../voice-caption/panel'));
const Guestbook = dynamic(() => import('../warm-guestbook/panel'));
/** Hosts connect one slot. Removing either registration leaves the other independent. */
export default function ArtworkExtensions({ endpoint, options, title, artist = '', en = false, getPublicLink, reviewKind }: {
    endpoint: string;
    options: unknown;
    title: string;
    artist?: string;
    en?: boolean;
    getPublicLink?: () => Promise<string>;
    reviewKind?: 'voice' | 'guestbook' | 'legacy-comment';
}) {
    const config = moduleOptions(options);
    return <div className="am-extensions">{config.voice.enabled && <Voice endpoint={endpoint} title={title} artist={artist} en={en} getPublicLink={getPublicLink}/>}{config.guestbook.enabled && <Guestbook endpoint={endpoint} en={en} reviewPending={reviewKind === 'guestbook'}/>}</div>;
}
