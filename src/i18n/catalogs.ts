// Message catalogs: one JSON file per interface locale and namespace under
// src/messages/<locale>/. Turkish is the source catalog; its shape types every
// message key (src/i18n/app-config.d.ts), the other locales must match it
// (checked here by the compiler and by src/i18n/catalogs.test.ts). Add a
// namespace by creating its file in every locale and listing it here.

import type { InterfaceLocale } from "@/lib/interface-locales";

import tr_common from "@/messages/tr/common.json";
import tr_posts from "@/messages/tr/posts.json";
import tr_archives from "@/messages/tr/archives.json";
import tr_search from "@/messages/tr/search.json";
import tr_sharing from "@/messages/tr/sharing.json";
import tr_comments from "@/messages/tr/comments.json";
import tr_bookmarks from "@/messages/tr/bookmarks.json";
import tr_auth from "@/messages/tr/auth.json";
import tr_account from "@/messages/tr/account.json";
import tr_avatars from "@/messages/tr/avatars.json";
import tr_admin from "@/messages/tr/admin.json";
import tr_adminPosts from "@/messages/tr/adminPosts.json";
import tr_adminEditor from "@/messages/tr/adminEditor.json";
import tr_adminTaxonomy from "@/messages/tr/adminTaxonomy.json";
import tr_adminAuthors from "@/messages/tr/adminAuthors.json";
import tr_adminMembers from "@/messages/tr/adminMembers.json";
import tr_adminMedia from "@/messages/tr/adminMedia.json";
import tr_adminComments from "@/messages/tr/adminComments.json";
import en_common from "@/messages/en/common.json";
import en_posts from "@/messages/en/posts.json";
import en_archives from "@/messages/en/archives.json";
import en_search from "@/messages/en/search.json";
import en_sharing from "@/messages/en/sharing.json";
import en_comments from "@/messages/en/comments.json";
import en_bookmarks from "@/messages/en/bookmarks.json";
import en_auth from "@/messages/en/auth.json";
import en_account from "@/messages/en/account.json";
import en_avatars from "@/messages/en/avatars.json";
import en_admin from "@/messages/en/admin.json";
import en_adminPosts from "@/messages/en/adminPosts.json";
import en_adminEditor from "@/messages/en/adminEditor.json";
import en_adminTaxonomy from "@/messages/en/adminTaxonomy.json";
import en_adminAuthors from "@/messages/en/adminAuthors.json";
import en_adminMembers from "@/messages/en/adminMembers.json";
import en_adminMedia from "@/messages/en/adminMedia.json";
import en_adminComments from "@/messages/en/adminComments.json";
import de_common from "@/messages/de/common.json";
import de_posts from "@/messages/de/posts.json";
import de_archives from "@/messages/de/archives.json";
import de_search from "@/messages/de/search.json";
import de_sharing from "@/messages/de/sharing.json";
import de_comments from "@/messages/de/comments.json";
import de_bookmarks from "@/messages/de/bookmarks.json";
import de_auth from "@/messages/de/auth.json";
import de_account from "@/messages/de/account.json";
import de_avatars from "@/messages/de/avatars.json";
import de_admin from "@/messages/de/admin.json";
import de_adminPosts from "@/messages/de/adminPosts.json";
import de_adminEditor from "@/messages/de/adminEditor.json";
import de_adminTaxonomy from "@/messages/de/adminTaxonomy.json";
import de_adminAuthors from "@/messages/de/adminAuthors.json";
import de_adminMembers from "@/messages/de/adminMembers.json";
import de_adminMedia from "@/messages/de/adminMedia.json";
import de_adminComments from "@/messages/de/adminComments.json";

const tr = {
  common: tr_common,
  posts: tr_posts,
  archives: tr_archives,
  search: tr_search,
  sharing: tr_sharing,
  comments: tr_comments,
  bookmarks: tr_bookmarks,
  auth: tr_auth,
  account: tr_account,
  avatars: tr_avatars,
  admin: tr_admin,
  adminPosts: tr_adminPosts,
  adminEditor: tr_adminEditor,
  adminTaxonomy: tr_adminTaxonomy,
  adminAuthors: tr_adminAuthors,
  adminMembers: tr_adminMembers,
  adminMedia: tr_adminMedia,
  adminComments: tr_adminComments,
};

export type Messages = typeof tr;

export type MessageNamespace = keyof Messages;

export const messageNamespaces = Object.keys(tr) as MessageNamespace[];

export const catalogs: Record<InterfaceLocale, Messages> = {
  tr,
  en: {
    common: en_common,
    posts: en_posts,
    archives: en_archives,
    search: en_search,
    sharing: en_sharing,
    comments: en_comments,
    bookmarks: en_bookmarks,
    auth: en_auth,
    account: en_account,
    avatars: en_avatars,
    admin: en_admin,
    adminPosts: en_adminPosts,
    adminEditor: en_adminEditor,
    adminTaxonomy: en_adminTaxonomy,
    adminAuthors: en_adminAuthors,
    adminMembers: en_adminMembers,
    adminMedia: en_adminMedia,
    adminComments: en_adminComments,
  },
  de: {
    common: de_common,
    posts: de_posts,
    archives: de_archives,
    search: de_search,
    sharing: de_sharing,
    comments: de_comments,
    bookmarks: de_bookmarks,
    auth: de_auth,
    account: de_account,
    avatars: de_avatars,
    admin: de_admin,
    adminPosts: de_adminPosts,
    adminEditor: de_adminEditor,
    adminTaxonomy: de_adminTaxonomy,
    adminAuthors: de_adminAuthors,
    adminMembers: de_adminMembers,
    adminMedia: de_adminMedia,
    adminComments: de_adminComments,
  },
};
