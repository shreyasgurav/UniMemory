from setuptools import setup, find_packages

setup(
    name="unimemory",
    version="1.0.0",
    description="UniMemory SDK — The memory layer for AI applications",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="UniMemory",
    author_email="support@unimemory.app",
    url="https://github.com/shreyasgurav/UniMemory",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "requests>=2.28.0",
    ],
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
