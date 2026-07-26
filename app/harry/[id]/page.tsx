import HarryChatView from '../../components/HarryChatView'

export default async function HarryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <HarryChatView key={id} chatId={Number(id)} />
}
