// Structured data for search engines and AI answers. `<` is escaped so text
// from content files can never close the script tag.
export default function JsonLd({data}: {data: unknown}) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(data).replace(/</g, '\u003c')}}/>;
}
