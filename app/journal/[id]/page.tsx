import JournalEditor from '../../components/JournalEditor'

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <JournalEditor entryId={id} />
}
