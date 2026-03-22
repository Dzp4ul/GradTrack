import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, X, Megaphone, Calendar, Tag,
} from 'lucide-react';

const API_BASE = '/api';

interface Announcement {
  id: number;
  title: string;
  content: string;
  category: string;
  status: string;
  published_at: string | null;
  created_at: string;
}

interface FormData {
  id?: number;
  title: string;
  content: string;
  category: string;
  status: string;
}

const emptyForm: FormData = {
  title: '', content: '', category: 'general', status: 'draft',
};

const statusStyle: Record<string, string> = {
  published: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-600',
};

const categoryStyle: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  event: 'bg-purple-100 text-purple-700',
  opportunity: 'bg-emerald-100 text-emerald-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const fetchAnnouncements = () => {
    setLoading(true);
    const params = filterStatus ? `?status=${filterStatus}` : '';
    fetch(`${API_BASE}/announcements/index.php${params}`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setAnnouncements(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAnnouncements(); }, [filterStatus]);

  const openAdd = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (a: Announcement) => {
    setFormData({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      status: a.status,
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    fetch(`${API_BASE}/announcements/index.php`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) { setShowModal(false); fetchAnnouncements(); }
      });
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    fetch(`${API_BASE}/announcements/index.php`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((r) => r.json())
      .then((res) => { if (res.success) fetchAnnouncements(); });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Announcement Manager</h1>
          <p className="text-sm text-gray-500">{announcements.length} announcements</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'published', 'draft', 'archived'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s
                ? 'bg-[#1b2a4a] text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No announcements found.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {announcements.map((a) => (
            <div key={a.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-[#1b2a4a]">{a.title}</h3>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusStyle[a.status] || ''}`}>
                      {a.status}
                    </span>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize flex items-center gap-1 ${categoryStyle[a.category] || ''}`}>
                      <Tag className="w-3 h-3" /> {a.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{a.content}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Created: {new Date(a.created_at).toLocaleDateString()}
                    </span>
                    {a.published_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Published: {new Date(a.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(a)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-[#1b2a4a]">
                {isEditing ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Announcement title"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={5}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Write your announcement..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="general">General</option>
                    <option value="event">Event</option>
                    <option value="opportunity">Opportunity</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2.5 bg-[#1b2a4a] text-white rounded-lg text-sm font-medium hover:bg-[#263c66] transition-colors">
                  {isEditing ? 'Update' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
