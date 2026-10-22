# Taxonomy module

Source: [`src/modules/taxonomy`](../src/modules/taxonomy). Taxonomy means the categories and tags that organize stories. A category is a broad group, such as Travel; tags provide more specific labels, such as Hiking. Tags are associated with a category.

## Route and files

The account route `/dashboard/taxonomy` is registered in `manifest.ts` and linked as Categories & tags.

| File inside the module | Responsibility |
| --- | --- |
| `pages/page.tsx` | Page entry that renders the manager. |
| `components/taxonomy-manager.tsx` | Category/tag forms, category expansion, editing dialogs, delete confirmation, loading/errors, and ownership-aware UI. |
| `types/index.ts` | Category/tag shapes and the input/selection types used by the manager and editor. |
| `api.ts` | Public `getCategories()` and `getTags()` requests through `apiWrapper`. |
| `cache.ts` | `getCachedTaxonomy()` loads both collections under the public `taxonomy` cache tag. |
| `actions.ts` | `getTaxonomyAction()` returns cached taxonomy to client-side callers with a success/error result. |
| `store/services/taxonomyApi.ts` | Injects the taxonomy query and save/delete mutations into the shared RTK Query API. |

## Reading and writing

The public website calls `getCachedTaxonomy()` directly from the server. The client manager/editor instead uses the RTK Query taxonomy hook. Its `queryFn` calls `getTaxonomyAction()`, which reuses that same public server cache. RTK Query then shares the result between client components.

For a write, the manager calls `saveTaxonomy` or `deleteTaxonomy`. The shared `baseApi` chooses `contentRequest`, which obtains the current token and invokes the content Server Action. NestJS checks the operation, and successful writes expire the public `taxonomy` and `blogs` tags. RTK Query invalidates `Taxonomy` and `Blog` so dashboard consumers can reload affected data.

| Backend request | Operation |
| --- | --- |
| `GET /categories`, `GET /tags` | Read public taxonomy. |
| `POST /categories`, `POST /tags` | Create an item; creating a tag includes its category ID. |
| `PATCH /categories/:id`, `PATCH /tags/:id` | Rename/update an item. |
| `DELETE /categories/:id`, `DELETE /tags/:id` | Delete an item subject to backend rules. |

## UI rules and state

Administrators can see all items in the manager. Other users see their own tags and categories they own or that contain their visible tags. These display filters are not authorization; NestJS must enforce each write.

React Hook Form holds form values. Local React state holds expanded categories, pending edit/delete selections, and busy/errors. Server collection data is in RTK Query. Names are trimmed and must contain a letter or number before the client submits them.

The blog editor uses category IDs and tag IDs for saving. The public search UI uses their slugs in URLs.

## Example

Create Travel, then create Hiking under Travel. In the story editor, select Travel and its appropriate tags. The public home page can filter results using the category/tag slugs. Renaming or deleting taxonomy should refresh the affected manager/editor/public data through the invalidation paths above.

## Manual checks

Create, rename, and delete items as an author and an administrator. Check tag/category relationships in the editor, visibility in the manager, delete confirmation, backend validation errors, and public filter updates.

Related: [Stories](blog.md), [Website](website.md).
