import { createClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables or LocalStorage
const getCredentials = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return { url: envUrl, key: envKey, source: 'env' };
  }

  const localUrl = localStorage.getItem('supabase_url');
  const localKey = localStorage.getItem('supabase_key');

  if (localUrl && localKey) {
    return { url: localUrl, key: localKey, source: 'local' };
  }

  return null;
};

let supabaseInstance = null;
const creds = getCredentials();
if (creds) {
  try {
    supabaseInstance = createClient(creds.url, creds.key);
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
  }
}

export const getSupabaseClient = () => {
  if (supabaseInstance) return supabaseInstance;
  
  // Re-check in case keys were saved recently without a full reload
  const activeCreds = getCredentials();
  if (activeCreds) {
    try {
      supabaseInstance = createClient(activeCreds.url, activeCreds.key);
      return supabaseInstance;
    } catch (e) {
      console.error('Failed to initialize Supabase client dynamically:', e);
    }
  }
  return null;
};

export const isConfigured = () => {
  return getSupabaseClient() !== null;
};

export const getConfigurationSource = () => {
  const creds = getCredentials();
  return creds ? creds.source : null;
};

export const saveCredentials = (url, key) => {
  if (!url || !key) return false;
  localStorage.setItem('supabase_url', url.trim());
  localStorage.setItem('supabase_key', key.trim());
  // Force re-initialization
  supabaseInstance = createClient(url.trim(), key.trim());
  return true;
};

export const clearCredentials = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabaseInstance = null;
};

// --- Applications API ---

export const fetchApplications = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('applications')
    .select('*')
    .order('deadline', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const addApplication = async (app) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  // If there's an auth user, assign user_id
  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  const payload = {
    name: app.name,
    link: app.link || '',
    links: app.links || [],
    deadline: app.deadline,
    priority: app.priority || 'medium',
    status: app.status || 'pending',
    notes: app.notes || '',
    company: app.company || '',
    ppi: !!app.ppi,
    travel: !!app.travel,
    onsite: !!app.onsite,
    remote: !!app.remote,
    ...(user ? { user_id: user.id } : {})
  };

  const { data, error } = await client
    .from('applications')
    .insert([payload])
    .select();

  if (error) throw error;
  return data[0];
};

export const updateApplication = async (id, updates) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('applications')
    .update({
      name: updates.name,
      link: updates.link,
      links: updates.links || [],
      deadline: updates.deadline,
      priority: updates.priority,
      status: updates.status,
      notes: updates.notes,
      company: updates.company,
      ppi: !!updates.ppi,
      travel: !!updates.travel,
      onsite: !!updates.onsite,
      remote: !!updates.remote
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const deleteApplication = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('applications')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};

// --- Ideas API ---

export const fetchIdeas = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('ideas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addIdea = async (idea) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  const payload = {
    title: idea.title,
    content: idea.content || '',
    image_url: idea.image_url || '',
    images: idea.images || [],
    links: idea.links || [],
    tags: idea.tags || [],
    ...(user ? { user_id: user.id } : {})
  };

  const { data, error } = await client
    .from('ideas')
    .insert([payload])
    .select();

  if (error) throw error;
  return data[0];
};

export const updateIdea = async (id, updates) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('ideas')
    .update({
      title: updates.title,
      content: updates.content,
      image_url: updates.image_url,
      images: updates.images || [],
      links: updates.links || [],
      tags: updates.tags
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const deleteIdea = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('ideas')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};

// --- Tasks API ---

export const fetchTasks = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const addTaskToSupabase = async (task) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const payload = {
    title: task.title,
    priority: task.priority || 'medium',
    is_recurring: !!task.is_recurring,
    recurrence: task.recurrence || 'daily',
    recurrence_days: task.recurrence_days || [],
    date: task.is_recurring ? null : (task.date || null),
    subtasks: task.subtasks || [],
    completed: false,
    // Spread in only when set: an unmigrated database has no such column,
    // and sending it unconditionally would break ordinary task creation
    // rather than just the hackathon-linked case.
    ...(task.hackathon_id ? { hackathon_id: task.hackathon_id } : {}),
  };

  const { data, error } = await client
    .from('tasks')
    .insert([payload])
    .select();

  if (error) throw error;
  return data[0];
};

export const updateTaskInSupabase = async (id, updates) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('tasks')
    .update({
      title: updates.title,
      priority: updates.priority,
      is_recurring: updates.is_recurring,
      recurrence: updates.recurrence,
      recurrence_days: updates.recurrence_days,
      date: updates.date,
      subtasks: updates.subtasks || [],
      completed: updates.completed,
      ...(updates.hackathon_id !== undefined ? { hackathon_id: updates.hackathon_id || null } : {}),
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const deleteTaskFromSupabase = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};

export const fetchTaskCompletions = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('task_completions')
    .select('*');

  if (error) throw error;
  return data || [];
};

export const upsertTaskCompletion = async (taskId, dateStr, completed) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  if (completed) {
    const { error } = await client
      .from('task_completions')
      .upsert({ task_id: taskId, date: dateStr, completed: true }, { onConflict: 'task_id,date' });
    if (error) throw error;
  } else {
    const { error } = await client
      .from('task_completions')
      .delete()
      .eq('task_id', taskId)
      .eq('date', dateStr);
    if (error) throw error;
  }
  return completed;
};

export const fetchSubtaskCompletions = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('subtask_completions')
    .select('*');

  if (error) throw error;
  return data || [];
};

export const upsertSubtaskCompletion = async (taskId, subtaskId, dateStr, completed) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  if (completed) {
    const { error } = await client
      .from('subtask_completions')
      .upsert({ task_id: taskId, subtask_id: subtaskId, date: dateStr, completed: true }, { onConflict: 'task_id,subtask_id,date' });
    if (error) throw error;
  } else {
    const { error } = await client
      .from('subtask_completions')
      .delete()
      .eq('task_id', taskId)
      .eq('subtask_id', subtaskId)
      .eq('date', dateStr);
    if (error) throw error;
  }
  return completed;
};


// --- Project Ideas API ---

export const fetchProjectIdeas = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('project_ideas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const addProjectIdea = async (idea) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }));
  const payload = {
    title: idea.title,
    content: idea.content || '',
    images: idea.images || [],
    links: idea.links || [],
    tags: idea.tags || [],
    ...(idea.status ? { status: idea.status } : {}),
    ...(idea.promoted_from ? { promoted_from: idea.promoted_from } : {}),
    ...(user ? { user_id: user.id } : {})
  };

  const { data, error } = await client
    .from('project_ideas')
    .insert([payload])
    .select();

  if (error) throw error;
  return data[0];
};

export const updateProjectIdea = async (id, updates) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('project_ideas')
    .update({
      title: updates.title,
      content: updates.content,
      images: updates.images || [],
      links: updates.links || [],
      tags: updates.tags,
      ...(updates.status ? { status: updates.status } : {}),
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const deleteProjectIdea = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('project_ideas')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
};

// --- Storage Bucket Image Upload ---

export const uploadIdeaImage = async (file) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  // Create a unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const filePath = `idea-images/${fileName}`;

  // Upload to public bucket named 'idea-images'
  const { error: uploadError } = await client.storage
    .from('idea-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    // If bucket doesn't exist, log detailed instructions or rethrow
    console.error('Upload error (make sure your storage bucket is public and named "idea-images"):', uploadError);
    throw uploadError;
  }

  // Get public URL
  const { data } = client.storage.from('idea-images').getPublicUrl(filePath);
  return data.publicUrl;
};
