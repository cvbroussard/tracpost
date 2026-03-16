/**
 * Generate ItemList + CollectionPage structured data.
 */
export interface CollectionData {
  name: string;
  description?: string;
  url: string;
  items?: Array<{
    name: string;
    url: string;
    image?: string;
    position?: number;
  }>;
}

export function generateCollectionSchema(
  data: CollectionData
): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];

  // CollectionPage
  const collectionPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: data.name,
    url: data.url,
  };
  if (data.description) collectionPage.description = data.description;
  schemas.push(collectionPage);

  // ItemList (if items available)
  if (data.items && data.items.length > 0) {
    const itemList: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: data.name,
      numberOfItems: data.items.length,
      itemListElement: data.items.map((item, i) => ({
        "@type": "ListItem",
        position: item.position ?? i + 1,
        name: item.name,
        url: item.url,
        ...(item.image && { image: item.image }),
      })),
    };
    schemas.push(itemList);
  }

  return schemas;
}
