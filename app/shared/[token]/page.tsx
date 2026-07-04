import SharedCollectionView from '../../components/SharedCollectionView'

export default async function SharedCollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedCollectionView token={token} />
}
