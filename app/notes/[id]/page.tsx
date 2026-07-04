import NoteEditor from '../../components/NoteEditor'

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <NoteEditor noteId={id} />
}
