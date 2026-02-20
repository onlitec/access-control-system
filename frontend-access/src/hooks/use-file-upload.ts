import React, { useRef, useState } from 'react';
import { useDropzone, type DropzoneOptions } from 'react-dropzone';
import { uploadImage } from '@/lib/upload';

export interface FileWithPreview extends File {
    preview: string;
    errors: Error[];
}

export interface UseFileUploadReturn {
    getRootProps: any;
    getInputProps: any;
    files: FileWithPreview[];
    setFiles: (files: FileWithPreview[]) => void;
    onUpload: () => Promise<void>;
    loading: boolean;
    successes: string[];
    errors: Error[];
    maxFiles: number;
    maxFileSize: number;
    isSuccess: boolean;
    isDragActive: boolean;
    isDragReject: boolean;
    inputRef: React.RefObject<HTMLInputElement>;
}

interface UseFileUploadProps extends DropzoneOptions {
    bucketName?: string; // Unused, kept for compatibility
    supabase?: any;      // Unused, kept for compatibility
    maxFiles?: number;
    maxFileSize?: number;
}

export function useFileUpload({
    maxFiles = 1,
    maxFileSize = 5 * 1024 * 1024,
    ...dropzoneOptions
}: UseFileUploadProps): UseFileUploadReturn {
    const [files, setFiles] = useState<FileWithPreview[]>([]);
    const [loading, setLoading] = useState(false);
    const [successes, setSuccesses] = useState<string[]>([]);
    const [errors, setErrors] = useState<Error[]>([]);
    const [isSuccess, setIsSuccess] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const onDrop = (acceptedFiles: File[]) => {
        const newFiles = acceptedFiles.map(file => Object.assign(file, {
            preview: URL.createObjectURL(file),
            errors: []
        }));
        setFiles(prev => [...prev, ...newFiles]);
    };

    const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
        onDrop,
        maxFiles,
        maxSize: maxFileSize,
        ...dropzoneOptions
    });

    const onUpload = async () => {
        setLoading(true);
        setErrors([]);
        setSuccesses([]);

        try {
            const uploadPromises = files.map(file => uploadImage(file, 'mock-bucket'));
            await Promise.all(uploadPromises);
            setSuccesses(files.map(f => f.name));
            setIsSuccess(true);
        } catch (err: any) {
            setErrors([new Error(err.message || 'Upload failed')]);
        } finally {
            setLoading(false);
        }
    };

    return {
        getRootProps,
        getInputProps,
        files,
        setFiles,
        onUpload,
        loading,
        successes,
        errors,
        maxFiles,
        maxFileSize,
        isSuccess,
        isDragActive,
        isDragReject,
        inputRef
    };
}
